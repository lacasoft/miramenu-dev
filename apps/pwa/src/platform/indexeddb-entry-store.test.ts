import type { FeedEntry } from "@miramenu/contracts";
import { describe, expect, it } from "vitest";
import { indexedDbEntryStore } from "./indexeddb-entry-store";

const entry = (n: number): FeedEntry => ({
  entryId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  branchId: "00000000-0000-4000-8000-000000000900",
  dishId: "00000000-0000-4000-8000-000000000001",
  enteredAt: new Date(Date.UTC(2026, 10, 12, 18, 0, n)).toISOString(),
  exposureMs: 1500,
  validView: true,
  exit: "manual",
});

// jsdom has no IndexedDB: these cover the fallback; the database itself is walked in Chrome.
describe("indexedDbEntryStore without IndexedDB", () => {
  it("keeps the entries in memory when the browser has none", async () => {
    const store = indexedDbEntryStore(() => undefined, 2);
    await store.add(entry(2));
    await store.add(entry(1));
    await store.add(entry(3));
    expect((await store.pending(10)).map((e) => e.enteredAt)).toEqual([
      entry(2).enteredAt,
      entry(3).enteredAt,
    ]);
    await store.remove([entry(2).entryId]);
    expect(await store.pending(10)).toEqual([entry(3)]);
  });

  it("keeps them in memory when the browser refuses to open it", async () => {
    const refused = {
      open: () => {
        throw new DOMException("denied", "SecurityError");
      },
    } as unknown as IDBFactory;
    const store = indexedDbEntryStore(() => refused);
    await store.add(entry(1));
    expect(await store.pending(10)).toEqual([entry(1)]);
  });
});
