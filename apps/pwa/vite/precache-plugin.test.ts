// The plugin in real Vite builds: a small app with the real worker entry, and the built
// worker run against a fake worker scope.
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "vite";
import { afterAll, describe, expect, it } from "vitest";
import { PRECACHE_PLACEHOLDER, precachePlugin } from "./precache-plugin.ts";

const roots: string[] = [];
afterAll(() =>
  Promise.all(roots.map((root) => rm(root, { recursive: true, force: true }))),
);

async function buildApp(
  files: Record<string, string>,
  entry?: (root: string) => string,
) {
  const root = await mkdtemp(join(tmpdir(), "miramenu-precache-"));
  roots.push(root);
  await writeFile(
    join(root, "index.html"),
    '<!doctype html><html><body><script type="module" src="/main.ts"></script></body></html>',
  );
  for (const [name, content] of Object.entries(files))
    await writeFile(join(root, name), content);
  await build({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: [precachePlugin(entry ? { entry: entry(root) } : {})],
    build: { outDir: join(root, "dist") },
  });
  return readFile(join(root, "dist", "sw.js"), "utf8");
}

const precacheIn = (worker: string) => {
  const found = /\{"version":"([0-9a-f]{16})","files":(\[[^\]]*\])\}/.exec(
    worker,
  );
  if (found === null) throw new Error("no precache in sw.js");
  return { version: found[1], files: JSON.parse(found[2] ?? "[]") as string[] };
};

/** Runs the built worker as a browser would, against a worker scope in memory. */
function runWorker(code: string) {
  const handlers = new Map<string, (event: unknown) => void>();
  const added: string[] = [];
  const scope = {
    location: { origin: "https://lafonda.example.test" },
    addEventListener: (type: string, handler: (event: unknown) => void) => {
      handlers.set(type, handler);
    },
    caches: {
      open: async () => ({
        addAll: async (requests: Request[]) => {
          added.push(...requests.map((each) => new URL(each.url).pathname));
        },
        match: async (key: string) =>
          key === "/index.html" ? new Response("the shell") : undefined,
      }),
      keys: async () => [],
      delete: async () => true,
    },
    fetch: async () => {
      throw new TypeError("Failed to fetch");
    },
  };
  new Function("self", code)(scope);
  const dispatch = async (type: string, extra: object = {}) => {
    let pending: Promise<unknown> = Promise.resolve();
    const keep = (promise: Promise<unknown>) => {
      pending = promise;
    };
    handlers.get(type)?.({ waitUntil: keep, respondWith: keep, ...extra });
    return pending;
  };
  return { added, dispatch };
}

describe("precachePlugin", () => {
  it("builds the worker to /sw.js as one classic script with the build's files", async () => {
    const worker = await buildApp({ "main.ts": 'console.log("menu");' });

    // A classic worker cannot import: the whole file must parse as a plain script.
    expect(() => new Function(worker)).not.toThrow();
    expect(worker).not.toContain(PRECACHE_PLACEHOLDER);
    const { files } = precacheIn(worker);
    expect(files).toContain("/index.html");
    expect(
      files.some((file) => /^\/assets\/index-[\w-]+\.js$/.test(file)),
    ).toBe(true);
    expect(files).not.toContain("/sw.js");
  });

  it("gives a build a version from its content: the same build, the same version", async () => {
    const first = precacheIn(
      await buildApp({ "main.ts": 'console.log("menu");' }),
    );
    const again = precacheIn(
      await buildApp({ "main.ts": 'console.log("menu");' }),
    );
    const changed = precacheIn(
      await buildApp({ "main.ts": 'console.log("menú nuevo");' }),
    );

    expect(again.version).toBe(first.version);
    expect(changed.version).not.toBe(first.version);
  });

  it("ships a worker that stores those files and opens with the shell offline", async () => {
    const worker = await buildApp({ "main.ts": 'console.log("menu");' });
    const { added, dispatch } = runWorker(worker);

    await dispatch("install");
    expect(added).toEqual(precacheIn(worker).files);
    const answer = (await dispatch("fetch", {
      request: {
        method: "GET",
        mode: "navigate",
        url: "https://lafonda.example.test/centro",
      },
    })) as Response;
    expect(await answer.text()).toBe("the shell");
  });

  it("fails the build for a worker with nowhere to write its files", async () => {
    await expect(
      buildApp(
        {
          "main.ts": 'console.log("menu");',
          "worker.ts": 'self.addEventListener("install", () => {});',
        },
        (root) => join(root, "worker.ts"),
      ),
    ).rejects.toThrow(`never reads ${PRECACHE_PLACEHOLDER}`);
  });

  it("fails the build for a worker that imports a chunk it shares with the app", async () => {
    await expect(
      buildApp(
        {
          "shared.ts": "export const greet = (name: string) => `hola ${name}`;",
          "main.ts":
            'import { greet } from "./shared"; console.log(greet("menu"));',
          "worker.ts": `import { greet } from "./shared"; console.log(greet("sw"), ${PRECACHE_PLACEHOLDER});`,
        },
        (root) => join(root, "worker.ts"),
      ),
    ).rejects.toThrow("must be a single file");
  });
});
