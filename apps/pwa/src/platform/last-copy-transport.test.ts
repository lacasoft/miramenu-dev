import type {
  HttpRequest,
  HttpResponse,
  Transport,
} from "@miramenu/api-client";
import { describe, expect, it } from "vitest";
import { withLastCopy, type OpenCache } from "./last-copy-transport";

const MENU_URL = "https://api.example.test/branches/b1/menu";
const kept: HttpRequest = {
  method: "GET",
  url: MENU_URL,
  headers: {},
  allowsLastCopy: true,
};
const plain: HttpRequest = {
  method: "GET",
  url: "https://api.example.test/branches/b1/interactions",
  headers: {},
};

const reply = (status: number, body: string): HttpResponse => ({
  status,
  header: (name) => (name === "content-type" ? "application/json" : null),
  text: async () => body,
});

function fakeCache() {
  const entries = new Map<string, Response>();
  const cache = {
    match: async (url: string) => entries.get(url)?.clone(),
    put: async (url: string, response: Response) => {
      entries.set(url, response);
    },
  } as unknown as Cache;
  const open: OpenCache = async () => cache;
  return { open, entries };
}

/** A transport that answers in turn with each of the given answers; an Error rejects. */
function answering(...answers: (HttpResponse | Error)[]): Transport {
  return async () => {
    const answer = answers.shift();
    if (answer === undefined) throw new Error("no more answers");
    if (answer instanceof Error) throw answer;
    return answer;
  };
}

const read = async (response: HttpResponse) => ({
  status: response.status,
  body: await response.text(),
});

describe("withLastCopy", () => {
  it("keeps a good answer and gives it back when the network fails", async () => {
    const cache = fakeCache();
    const transport = withLastCopy(
      answering(reply(200, '{"version":3}'), new TypeError("Failed to fetch")),
      cache.open,
    );

    expect(await read(await transport(kept))).toEqual({
      status: 200,
      body: '{"version":3}',
    });
    const offline = await transport(kept);
    expect(await read(offline)).toEqual({ status: 200, body: '{"version":3}' });
    expect(offline.header("content-type")).toBe("application/json");
  });

  it("gives the copy back while the server is down, and its answer when there is none", async () => {
    const cache = fakeCache();
    const down = reply(503, '{"code":"SERVICE_UNAVAILABLE"}');

    expect(
      await read(await withLastCopy(answering(down), cache.open)(kept)),
    ).toEqual({
      status: 503,
      body: '{"code":"SERVICE_UNAVAILABLE"}',
    });
    const transport = withLastCopy(
      answering(reply(200, '{"version":4}'), down),
      cache.open,
    );
    await transport(kept);
    expect(await read(await transport(kept))).toEqual({
      status: 200,
      body: '{"version":4}',
    });
  });

  it("passes any other answer on as the API's own, without keeping it", async () => {
    const cache = fakeCache();
    const transport = withLastCopy(
      answering(
        reply(200, '{"version":5}'),
        reply(404, '{"code":"NOT_FOUND"}'),
      ),
      cache.open,
    );
    await transport(kept);

    expect(await read(await transport(kept))).toEqual({
      status: 404,
      body: '{"code":"NOT_FOUND"}',
    });
    expect(await cache.entries.get(MENU_URL)?.text()).toBe('{"version":5}');
  });

  it("leaves every other request alone: never kept, never stood in for", async () => {
    const cache = fakeCache();
    const failure = new TypeError("Failed to fetch");
    const transport = withLastCopy(
      answering(reply(200, "{}"), failure),
      cache.open,
    );

    await transport(plain);
    expect(cache.entries.size).toBe(0);
    await expect(transport(plain)).rejects.toBe(failure);
  });

  it("fails as the network did when there is no copy, or the body breaks off", async () => {
    const failure = new TypeError("Failed to fetch");
    await expect(
      withLastCopy(answering(failure), fakeCache().open)(kept),
    ).rejects.toBe(failure);

    const cache = fakeCache();
    const broken: HttpResponse = {
      status: 200,
      header: () => null,
      text: async () => {
        throw failure;
      },
    };
    const transport = withLastCopy(
      answering(reply(200, '{"version":6}'), broken),
      cache.open,
    );
    await transport(kept);
    expect(await read(await transport(kept))).toEqual({
      status: 200,
      body: '{"version":6}',
    });
  });

  it("still answers when the browser has no cache or refuses it", async () => {
    const refused: OpenCache = async () => {
      throw new DOMException("denied", "SecurityError");
    };
    expect(
      await read(
        await withLastCopy(answering(reply(200, "{}")), refused)(kept),
      ),
    ).toEqual({
      status: 200,
      body: "{}",
    });
    const none: OpenCache = async () => null;
    const failure = new TypeError("Failed to fetch");
    await expect(withLastCopy(answering(failure), none)(kept)).rejects.toBe(
      failure,
    );
  });
});
