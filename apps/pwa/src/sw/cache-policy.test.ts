import { describe, expect, it } from "vitest";
import {
  activate,
  appCacheOf,
  install,
  respond,
  routeOf,
  SHELL,
  type CacheLike,
  type CachesLike,
} from "./cache-policy";

const ORIGIN = "https://lafonda.example.test";
const PRECACHE = {
  version: "v2",
  files: ["/index.html", "/assets/index-abc.js"],
};
const FILES = new Set(PRECACHE.files);

const request = (url: string, mode: RequestMode = "cors", method = "GET") => ({
  method,
  mode,
  url,
});

const pathOf = (key: RequestInfo | URL) =>
  new URL(
    typeof key === "string" ? key : key instanceof URL ? key.href : key.url,
    ORIGIN,
  ).pathname;

/** Cache Storage in memory: cache name → path → body. */
function fakeCaches(initial: Record<string, Record<string, string>> = {}) {
  const stores = new Map(
    Object.entries(initial).map(([name, files]) => [
      name,
      new Map(Object.entries(files)),
    ]),
  );
  const added: Request[] = [];
  const cacheOf = (name: string): CacheLike => ({
    // As a server's "Vary: Origin" makes the browser do: the worker stored each file
    // without an Origin, so a request that carries one misses unless Vary is ignored.
    match: async (key, options) => {
      const body = stores.get(name)?.get(pathOf(key));
      const varies = key instanceof Request && key.headers.has("origin");
      if (body === undefined || (varies && options?.ignoreVary !== true)) return undefined;
      return new Response(body);
    },
    addAll: async (requests) => {
      const files = stores.get(name) ?? new Map<string, string>();
      stores.set(name, files);
      for (const each of requests) {
        if (typeof each !== "string") added.push(each);
        files.set(pathOf(each), `stored ${pathOf(each)}`);
      }
    },
  });
  const caches: CachesLike = {
    open: async (name) => cacheOf(name),
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
  };
  return { caches, stores, added };
}

const offline = async (): Promise<Response> => {
  throw new TypeError("Failed to fetch");
};
const network =
  (body: string, status = 200) =>
  async () =>
    new Response(body, { status });

describe("what the worker handles", () => {
  it("handles the app's pages and files, and leaves the rest to the network", () => {
    const routes = [
      [request(`${ORIGIN}/centro?view=feed`, "navigate"), "page"],
      [request(`${ORIGIN}/`, "navigate"), "page"],
      [request(`${ORIGIN}/assets/index-abc.js`), "file"],
      [request(`${ORIGIN}/index.html`), "file"],
      // Not this version's: maybe a newer page's file, straight from the network.
      [request(`${ORIGIN}/assets/index-new.js`), "network"],
      [request(`${ORIGIN}/assets/index-abc.js`, "cors", "POST"), "network"],
      // The API and the media are never touched (ADR-0046).
      [request("https://api.example.test/branches/b1/menu"), "network"],
      [request("https://media.example.test/dish.webp", "no-cors"), "network"],
    ] as const;
    for (const [each, route] of routes)
      expect(routeOf(each, ORIGIN, FILES), each.url).toBe(route);
  });
});

describe("installing and activating", () => {
  it("stores this version's files straight from the server", async () => {
    const { caches, stores, added } = fakeCaches();
    await install(PRECACHE, caches, ORIGIN);

    expect([...(stores.get(appCacheOf("v2"))?.keys() ?? [])]).toEqual(
      PRECACHE.files,
    );
    expect(added.map((each) => [each.url, each.cache])).toEqual([
      [`${ORIGIN}/index.html`, "reload"],
      [`${ORIGIN}/assets/index-abc.js`, "reload"],
    ]);
  });

  it("drops older versions only, keeping the page's last copy of the menu", async () => {
    const { caches, stores } = fakeCaches({
      [appCacheOf("v1")]: { "/index.html": "old" },
      [appCacheOf("v2")]: { "/index.html": "new" },
      "miramenu-last-copy": { "/branches/b1/menu": "{}" },
      "someone-else": {},
    });
    await activate(PRECACHE, caches);

    expect([...stores.keys()]).toEqual([
      appCacheOf("v2"),
      "miramenu-last-copy",
      "someone-else",
    ]);
  });
});

describe("answering", () => {
  const stored = () =>
    fakeCaches({
      [appCacheOf("v2")]: {
        [SHELL]: "the shell",
        "/assets/index-abc.js": "the script",
      },
    }).caches;
  const page = new Request(`${ORIGIN}/centro`);
  // A module script or a crossorigin stylesheet: the page sends its Origin.
  const file = new Request(`${ORIGIN}/assets/index-abc.js`, {
    headers: { origin: ORIGIN },
  });
  const text = async (response: Promise<Response>) => {
    const answer = await response;
    return [answer.status, await answer.text()];
  };

  it("gives a file from this version's cache, without the network", async () => {
    expect(
      await text(
        respond("file", file, {
          caches: stored(),
          fetch: offline,
          version: "v2",
        }),
      ),
    ).toEqual([200, "the script"]);
  });

  it("asks the network for a file this version lacks", async () => {
    const caches = fakeCaches().caches;
    expect(
      await text(
        respond("file", file, {
          caches,
          fetch: network("fresh"),
          version: "v2",
        }),
      ),
    ).toEqual([200, "fresh"]);
  });

  it("gives the network's page while there is one, a 404 included", async () => {
    const caches = stored();
    expect(
      await text(
        respond("page", page, {
          caches,
          fetch: network("fresh page"),
          version: "v2",
        }),
      ),
    ).toEqual([200, "fresh page"]);
    expect(
      await text(
        respond("page", page, {
          caches,
          fetch: network("gone", 404),
          version: "v2",
        }),
      ),
    ).toEqual([404, "gone"]);
  });

  it("opens with the shell without network or with the server down", async () => {
    const caches = stored();
    expect(
      await text(
        respond("page", page, { caches, fetch: offline, version: "v2" }),
      ),
    ).toEqual([200, "the shell"]);
    expect(
      await text(
        respond("page", page, {
          caches,
          fetch: network("bad gateway", 502),
          version: "v2",
        }),
      ),
    ).toEqual([200, "the shell"]);
  });

  it("fails as the network did when this version keeps no shell", async () => {
    const caches = fakeCaches().caches;
    await expect(
      respond("page", page, { caches, fetch: offline, version: "v2" }),
    ).rejects.toThrow("Failed to fetch");
    expect(
      await text(
        respond("page", page, {
          caches,
          fetch: network("bad gateway", 502),
          version: "v2",
        }),
      ),
    ).toEqual([502, "bad gateway"]);
  });
});
