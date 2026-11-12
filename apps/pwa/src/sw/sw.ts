// The service worker, built to /sw.js by the precache plugin (vite/precache-plugin.ts).
// It only wires the worker's events to cache-policy; the rules live there.
import {
  activate,
  install,
  respond,
  routeOf,
  type Precache,
} from "./cache-policy";

/** The build's files and version, written in by the precache plugin. */
declare const __MIRAMENU_PRECACHE__: Precache;

const worker = self as unknown as ServiceWorkerGlobalScope;
const precache = __MIRAMENU_PRECACHE__;
const files = new Set(precache.files);

// No skipWaiting and no claim: a new version takes over on the next visit, never in the
// middle of one, and the first visit runs as it loaded.
worker.addEventListener("install", (event) => {
  event.waitUntil(install(precache, worker.caches, worker.location.origin));
});

worker.addEventListener("activate", (event) => {
  event.waitUntil(activate(precache, worker.caches));
});

worker.addEventListener("fetch", (event) => {
  const route = routeOf(event.request, worker.location.origin, files);
  if (route === "network") return;
  event.respondWith(
    respond(route, event.request, {
      caches: worker.caches,
      fetch: (request) => worker.fetch(request),
      version: precache.version,
    }),
  );
});
