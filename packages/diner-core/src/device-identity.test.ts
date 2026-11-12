import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEVICE_ID_KEY,
  deviceIdOf,
  type KeyValueStore,
} from "./device-identity.ts";

const ID = "6f1c2e0a-8b3d-4c5e-9f7a-1b2c3d4e5f60";
const OTHER = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

function memoryStore(initial: Record<string, string> = {}): KeyValueStore & {
  values: Map<string, string>;
} {
  const values = new Map(Object.entries(initial));
  return {
    values,
    get: (key) => values.get(key) ?? null,
    set: (key, value) => {
      values.set(key, value);
    },
  };
}

describe("deviceIdOf", () => {
  it("creates the id once and keeps it", () => {
    const store = memoryStore();
    let created = 0;
    const newId = () => {
      created += 1;
      return ID;
    };

    assert.equal(deviceIdOf(store, newId), ID);
    assert.equal(deviceIdOf(store, newId), ID);
    assert.equal(created, 1);
    assert.equal(store.values.get(DEVICE_ID_KEY), ID);
  });

  it("keeps the id a previous visit stored", () => {
    const store = memoryStore({ [DEVICE_ID_KEY]: OTHER });
    assert.equal(
      deviceIdOf(store, () => ID),
      OTHER,
    );
  });

  it("replaces a value that is not a device id", () => {
    const store = memoryStore({ [DEVICE_ID_KEY]: "not-an-id" });
    assert.equal(
      deviceIdOf(store, () => ID),
      ID,
    );
    assert.equal(store.values.get(DEVICE_ID_KEY), ID);
  });
});
