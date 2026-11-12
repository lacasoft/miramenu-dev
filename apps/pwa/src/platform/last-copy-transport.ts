import type { HttpResponse, Transport } from "@miramenu/api-client";

/** The browser's Cache Storage entry for the last answers; the service worker leaves it alone. */
export const LAST_COPY_CACHE = "miramenu-last-copy";

/** The cache, or null where the browser has none (an insecure context). */
export type OpenCache = () => Promise<Cache | null>;

const browserCache: OpenCache = async () =>
  typeof caches === "undefined" ? null : caches.open(LAST_COPY_CACHE);

const answered = (
  status: number,
  header: HttpResponse["header"],
  body: string,
) => ({
  status,
  header,
  text: async () => body,
});

async function lastCopyOf(
  open: OpenCache,
  url: string,
): Promise<HttpResponse | null> {
  try {
    const kept = await (await open())?.match(url);
    if (kept === undefined) return null;
    const body = await kept.text();
    return answered(kept.status, (name) => kept.headers.get(name), body);
  } catch {
    return null; // An unreadable cache is a missing copy.
  }
}

async function keep(
  open: OpenCache,
  url: string,
  response: HttpResponse,
  body: string,
) {
  try {
    const headers = {
      "content-type": response.header("content-type") ?? "application/json",
    };
    await (
      await open()
    )?.put(url, new Response(body, { status: response.status, headers }));
  } catch {
    // A full or refused cache only costs the offline copy; the answer itself is good.
  }
}

/**
 * Keeps the last good answer of the requests that allow it (the branch's resolution and
 * its menu) and gives it back when the network fails or the server is down (5xx), so the
 * PWA opens offline with the menu it last showed. Kept by the page itself, it is there
 * from the first visit, before any service worker controls it. Any other answer, a 404
 * included, is the API's own; every other request passes through untouched.
 */
export function withLastCopy(
  transport: Transport,
  open: OpenCache = browserCache,
): Transport {
  return async (request) => {
    if (request.allowsLastCopy !== true) return transport(request);
    const orCopy = async (error: unknown) => {
      const copy = await lastCopyOf(open, request.url);
      if (copy === null) throw error;
      return copy;
    };
    let response: HttpResponse;
    let body: string;
    try {
      response = await transport(request);
      body = await response.text();
    } catch (error) {
      return orCopy(error);
    }
    if (response.status >= 500)
      return (
        (await lastCopyOf(open, request.url)) ??
        answered(response.status, response.header, body)
      );
    if (response.status >= 200 && response.status < 300)
      await keep(open, request.url, response, body);
    return answered(response.status, response.header, body);
  };
}
