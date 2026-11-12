import { afterEach, describe, expect, it, vi } from "vitest";
import { sendBeacon } from "./beacon";

const request = { url: "https://api.example.test/feed-entries/batch", body: '{"entries":[]}' };

afterEach(() => {
  Reflect.deleteProperty(navigator, "sendBeacon");
});

describe("sendBeacon", () => {
  it("hands the body to the browser as is, so it goes as text/plain", () => {
    const beacon = vi.fn(() => true);
    Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: beacon });

    expect(sendBeacon(request)).toBe(true);
    expect(beacon).toHaveBeenCalledWith(request.url, request.body);
  });

  it("says no when the browser has no beacon or refuses it", () => {
    expect(sendBeacon(request)).toBe(false);
    Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: () => false });
    expect(sendBeacon(request)).toBe(false);
  });
});
