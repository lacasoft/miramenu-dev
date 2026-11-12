import { describe, expect, it } from "vitest";
import { localKeyValueStore } from "./local-storage";

/** A Storage that keeps its values, as a browser's localStorage does between visits. */
function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
  };
}

const refusing = (): Storage => {
  throw new DOMException("blocked", "SecurityError");
};

describe("localKeyValueStore", () => {
  it("keeps values in localStorage, between visits", () => {
    const storage = memoryStorage();
    localKeyValueStore(() => storage).set("miramenu.deviceId", "abc");
    expect(localKeyValueStore(() => storage).get("miramenu.deviceId")).toBe("abc");
  });

  it("falls back to memory for this visit when the browser refuses storage", () => {
    const store = localKeyValueStore(refusing);
    expect(store.get("miramenu.deviceId")).toBeNull();
    store.set("miramenu.deviceId", "abc");
    expect(store.get("miramenu.deviceId")).toBe("abc");
  });
});
