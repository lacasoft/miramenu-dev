/**
 * What the service worker does (ADR-0046): it keeps this version of the app so the PWA
 * opens without network, and nothing else. The API and the media are never touched: the
 * last menu is the page's own copy (withLastCopy), and without network the media show
 * their empty space. Free of the worker's globals, so it is tested as plain code.
 */

/** The build's files, written into the worker by the precache plugin. */
export interface Precache {
  /** From the build's content: a new one installs a new worker. */
  version: string;
  /** Root-relative paths, the shell among them. */
  files: readonly string[];
}

/** The page every restaurant and path opens with (ADR-0029): one SPA for all of them. */
export const SHELL = "/index.html";

const APP_CACHE_PREFIX = "miramenu-app-";

export const appCacheOf = (version: string) => `${APP_CACHE_PREFIX}${version}`;

/** The worker's way with a request: the app's page, one of its files, or let it be. */
export type Route = "page" | "file" | "network";

export function routeOf(
  request: Pick<Request, "method" | "mode" | "url">,
  appOrigin: string,
  files: ReadonlySet<string>,
): Route {
  if (request.method !== "GET") return "network";
  const url = new URL(request.url);
  if (url.origin !== appOrigin) return "network";
  if (request.mode === "navigate") return "page";
  return files.has(url.pathname) ? "file" : "network";
}

/** The part of Cache Storage the worker uses; the browser's satisfies it. */
export interface CacheLike {
  match(
    request: RequestInfo | URL,
    options?: CacheQueryOptions,
  ): Promise<Response | undefined>;
  addAll(requests: RequestInfo[]): Promise<void>;
}

export interface CachesLike {
  open(name: string): Promise<CacheLike>;
  keys(): Promise<string[]>;
  delete(name: string): Promise<boolean>;
}

/** Stores this version's files; if one fails, the install fails and the old worker stays. */
export async function install(
  precache: Precache,
  caches: CachesLike,
  origin: string,
): Promise<void> {
  const cache = await caches.open(appCacheOf(precache.version));
  // Straight from the server: the HTTP cache may still hold an older index.html.
  await cache.addAll(
    precache.files.map(
      (file) => new Request(new URL(file, origin), { cache: "reload" }),
    ),
  );
}

/** Drops the files of older versions; the page's last copy of the menu stays. */
export async function activate(
  precache: Precache,
  caches: CachesLike,
): Promise<void> {
  const current = appCacheOf(precache.version);
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => name.startsWith(APP_CACHE_PREFIX) && name !== current)
      .map((name) => caches.delete(name)),
  );
}

/**
 * The cache holds this version's files only, so a server's Vary (Origin, for one) is
 * beside the point: the page asks for its module and its styles with an Origin that the
 * worker's own requests never carried, and honoring Vary would miss every file.
 */
const THIS_VERSION: CacheQueryOptions = { ignoreVary: true };

interface Respond {
  caches: CachesLike;
  fetch: (request: Request) => Promise<Response>;
  version: string;
}

/**
 * A file: from this version's cache, else from the network. The page: from the network,
 * fresh; without network, or with the server down, the shell this version keeps.
 */
export async function respond(
  route: Exclude<Route, "network">,
  request: Request,
  { caches, fetch, version }: Respond,
): Promise<Response> {
  const cache = await caches.open(appCacheOf(version));
  if (route === "file")
    return (await cache.match(request, THIS_VERSION)) ?? fetch(request);
  let response: Response;
  try {
    response = await fetch(request);
  } catch (error) {
    const shell = await cache.match(SHELL, THIS_VERSION);
    if (shell === undefined) throw error;
    return shell;
  }
  if (response.status < 500) return response;
  return (await cache.match(SHELL, THIS_VERSION)) ?? response;
}
