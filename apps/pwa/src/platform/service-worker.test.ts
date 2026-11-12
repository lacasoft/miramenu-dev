import { afterEach, describe, expect, it, vi } from "vitest";
import { registerServiceWorker } from "./service-worker";

const containerWith = (register: ServiceWorkerContainer["register"]) =>
  ({ register }) as unknown as ServiceWorkerContainer;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("registerServiceWorker", () => {
  it("registers /sw.js in a production build once the page has loaded", async () => {
    const register = vi.fn(async () => ({}) as ServiceWorkerRegistration);
    // jsdom has loaded the page already: it registers right away.
    registerServiceWorker(true, containerWith(register));
    expect(register).toHaveBeenCalledWith("/sw.js");
  });

  it("waits for the page to load when it has not yet", () => {
    vi.spyOn(document, "readyState", "get").mockReturnValue("interactive");
    const register = vi.fn(async () => ({}) as ServiceWorkerRegistration);
    registerServiceWorker(true, containerWith(register));
    expect(register).not.toHaveBeenCalled();
    window.dispatchEvent(new Event("load"));
    expect(register).toHaveBeenCalledOnce();
  });

  it("does nothing in development or where the browser has no service workers", () => {
    const register = vi.fn(async () => ({}) as ServiceWorkerRegistration);
    registerServiceWorker(false, containerWith(register));
    expect(register).not.toHaveBeenCalled();
    expect(() => registerServiceWorker(true, undefined)).not.toThrow();
  });

  it("says so in the console when the browser refuses it, and the page goes on", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const refusal = new DOMException("refused", "SecurityError");
    registerServiceWorker(true, containerWith(async () => Promise.reject(refusal)));
    await vi.waitFor(() => expect(warn).toHaveBeenCalledWith(expect.any(String), refusal));
  });
});
