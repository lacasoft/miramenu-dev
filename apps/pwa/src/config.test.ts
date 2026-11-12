import { describe, expect, it } from "vitest";
import { parsePwaConfig } from "./config";

const REQUIRED = {
  VITE_API_URL: "https://api.mirame.nu/",
  VITE_PUBLIC_SITE_URL: "https://mirame.nu",
};

describe("parsePwaConfig", () => {
  it("reads the origins and takes the design's feed timings by default", () => {
    expect(parsePwaConfig(REQUIRED)).toEqual({
      apiUrl: "https://api.mirame.nu",
      siteHostname: "mirame.nu",
      feed: { stillMs: 5000, holdMs: 10_000 },
    });
    expect(
      parsePwaConfig({ ...REQUIRED, VITE_FEED_IMAGE_SECONDS: "", VITE_FEED_PAUSE_SECONDS: "" }).feed,
    ).toEqual({ stillMs: 5000, holdMs: 10_000 });
  });

  it("lets the environment tune the feed", () => {
    expect(
      parsePwaConfig({ ...REQUIRED, VITE_FEED_IMAGE_SECONDS: "7", VITE_FEED_PAUSE_SECONDS: "15" }).feed,
    ).toEqual({ stillMs: 7000, holdMs: 15_000 });
  });

  it("fails naming the variables, never their values", () => {
    expect(() =>
      parsePwaConfig({
        VITE_API_URL: "https://api.mirame.nu/secret-path",
        VITE_FEED_IMAGE_SECONDS: "0",
      }),
    ).toThrow(
      /^Invalid PWA configuration: VITE_API_URL, VITE_PUBLIC_SITE_URL, VITE_FEED_IMAGE_SECONDS$/,
    );
  });
});
