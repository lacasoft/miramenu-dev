import { deviceIdSchema } from "@miramenu/contracts";

/**
 * Where a platform keeps small values on the device: localStorage on the web, its own
 * store in a native app (ADR-0024).
 */
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export const DEVICE_ID_KEY = "miramenu.deviceId";

/**
 * The device's anonymous id (ADR-0040): created once and kept, so the diner's likes stay
 * theirs between visits and move to their account when they register. A missing or
 * malformed value is replaced; ids come from the platform, since this package has no
 * crypto of its own.
 */
export function deviceIdOf(store: KeyValueStore, newId: () => string): string {
  const stored = store.get(DEVICE_ID_KEY);
  if (stored !== null && deviceIdSchema.safeParse(stored).success)
    return stored;
  const id = newId();
  store.set(DEVICE_ID_KEY, id);
  return id;
}
