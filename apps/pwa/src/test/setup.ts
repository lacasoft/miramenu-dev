// What jsdom lacks and the screens rely on, reduced to what the tests need to drive them.
import { afterEach, vi } from "vitest";

/** Every observer the screens created, so a test can say which card came into view. */
const observers = new Set<FakeIntersectionObserver>();

class FakeIntersectionObserver {
  private readonly targets = new Set<Element>();

  private readonly callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    observers.add(this);
  }

  observe(target: Element) {
    this.targets.add(target);
  }

  unobserve(target: Element) {
    this.targets.delete(target);
  }

  disconnect() {
    this.targets.clear();
    observers.delete(this);
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  reveal(target: Element) {
    if (!this.targets.has(target)) return;
    const entry = { target, isIntersecting: true, intersectionRatio: 1 };
    this.callback(
      [entry as unknown as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

/** As if the element scrolled into view: its observers learn it is intersecting. */
export function revealInViewport(target: Element) {
  for (const observer of observers) observer.reveal(target);
}

vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);

vi.stubGlobal("matchMedia", (query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
}));

// <dialog>: showModal opens it and moves the focus inside, as browsers do; close closes
// it. The focus trap itself is not modelled.
HTMLDialogElement.prototype.showModal = function showModal() {
  this.setAttribute("open", "");
  this.querySelector<HTMLElement>(
    "button, [href], input, textarea, select",
  )?.focus();
};
HTMLDialogElement.prototype.close = function close() {
  this.removeAttribute("open");
  this.dispatchEvent(new Event("close"));
};

// Video: playing and pausing only report it, as a browser would with a muted autoplay.
HTMLMediaElement.prototype.play = function play() {
  this.dispatchEvent(new Event("play"));
  return Promise.resolve();
};
HTMLMediaElement.prototype.pause = function pause() {
  this.dispatchEvent(new Event("pause"));
};

afterEach(() => {
  observers.clear();
  window.history.replaceState(null, "", "/");
});
