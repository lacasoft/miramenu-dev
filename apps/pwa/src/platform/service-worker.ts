/**
 * Registers the service worker (src/sw/sw.ts, built to /sw.js) once the page has loaded,
 * so it never competes with the first card (RNF-01). Only a production build has one: the
 * dev server serves no sw.js. Without it the PWA works the same, only not offline.
 */
export function registerServiceWorker(
  production: boolean,
  container: ServiceWorkerContainer | undefined = navigator.serviceWorker,
): void {
  if (!production || container === undefined) return;
  const register = () => {
    container.register("/sw.js").catch((error: unknown) => {
      console.warn("The service worker could not be registered", error);
    });
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
