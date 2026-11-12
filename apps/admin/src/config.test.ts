import { describe, expect, it } from "vitest";
import { parseAdminConfig } from "./config";

describe("parseAdminConfig", () => {
  it("takes the API's origin, without a trailing slash", () => {
    expect(parseAdminConfig({ VITE_API_URL: "https://api.mirame.nu/" })).toEqual({
      apiUrl: "https://api.mirame.nu",
    });
  });

  it("names the variable that is missing or not an origin, never its value", () => {
    for (const env of [{}, { VITE_API_URL: "https://api.mirame.nu/v1" }, { VITE_API_URL: "ftp://x" }]) {
      expect(() => parseAdminConfig(env)).toThrow("Invalid admin configuration: VITE_API_URL");
    }
    expect(() => parseAdminConfig({ VITE_API_URL: "secret-value" })).not.toThrow(/secret-value/);
  });
});
