import type { KeyValueStore } from "@miramenu/diner-core";

/**
 * The web's KeyValueStore (ADR-0024). Some browsers refuse localStorage (private modes,
 * blocked storage); the values then live in memory for this visit only, and the menu
 * keeps working.
 */
export function localKeyValueStore(
  storage: () => Storage = () => window.localStorage,
): KeyValueStore {
  const memory = new Map<string, string>();
  return {
    get(key) {
      try {
        return storage().getItem(key) ?? memory.get(key) ?? null;
      } catch {
        return memory.get(key) ?? null;
      }
    },
    set(key, value) {
      memory.set(key, value);
      try {
        storage().setItem(key, value);
      } catch {
        // Kept in memory above: the device id lasts this visit instead of failing it.
      }
    },
  };
}
