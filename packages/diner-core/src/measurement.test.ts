import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  feedEntrySchema,
  type BatchReceipt,
  type FeedEntry,
} from "@miramenu/contracts";
import {
  createEntryOutbox,
  flushEntries,
  memoryEntryStore,
  settledEntryIds,
  type EntryStore,
} from "./entry-outbox.ts";
import { closeEntry, openEntry, setExposure } from "./feed-entry.ts";

const BRANCH = "6f1c2e0a-8b3d-4c5e-9f7a-1b2c3d4e5f60";
const DISH = "2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const T0 = Date.parse("2026-11-12T18:00:00Z");

describe("a feed entry", () => {
  it("counts the time in view and a valid view after one continuous second", () => {
    const entry = closeEntry(
      openEntry(id(1), DISH, T0, true),
      BRANCH,
      "manual",
      T0 + 2400,
    );
    assert.deepEqual(entry, {
      entryId: id(1),
      branchId: BRANCH,
      dishId: DISH,
      enteredAt: "2026-11-12T18:00:00.000Z",
      exposureMs: 2400,
      validView: true,
      exit: "manual",
    });
    assert.ok(feedEntrySchema.safeParse(entry).success);
  });

  it("pauses while covered or hidden, and only a continuous second makes a valid view", () => {
    let entry = openEntry(id(1), DISH, T0, true);
    entry = setExposure(entry, false, T0 + 600); // the detail opens
    entry = setExposure(entry, true, T0 + 5_000); // and closes
    const closed = closeEntry(entry, BRANCH, "manual", T0 + 5_700);

    assert.equal(closed.exposureMs, 1300);
    assert.equal(closed.validView, false);
    assert.ok(feedEntrySchema.safeParse(closed).success);
  });

  it("keeps a valid view reached before a pause", () => {
    let entry = openEntry(id(1), DISH, T0, true);
    entry = setExposure(entry, false, T0 + 1_000);
    entry = setExposure(entry, true, T0 + 9_000);
    assert.equal(closeEntry(entry, BRANCH, "auto", T0 + 9_200).validView, true);
  });

  it("starts unexposed when it opens under a layer, and ignores repeated signals", () => {
    let entry = openEntry(id(1), DISH, T0, false);
    entry = setExposure(entry, false, T0 + 3_000);
    entry = setExposure(entry, true, T0 + 4_000);
    entry = setExposure(entry, true, T0 + 4_500);
    assert.equal(
      closeEntry(entry, BRANCH, "abandoned", T0 + 5_000).exposureMs,
      1000,
    );
  });

  it("caps the exposure at the API's limit", () => {
    const entry = closeEntry(
      openEntry(id(1), DISH, T0, true),
      BRANCH,
      "abandoned",
      T0 + 3_600_000,
    );
    assert.equal(entry.exposureMs, 600_000);
    assert.ok(feedEntrySchema.safeParse(entry).success);
  });
});

const entry = (n: number): FeedEntry => ({
  entryId: id(n),
  branchId: BRANCH,
  dishId: DISH,
  enteredAt: new Date(T0 + n).toISOString(),
  exposureMs: 1500,
  validView: true,
  exit: "manual",
});

function memoryStore(count: number): EntryStore & { left: () => string[] } {
  let entries = Array.from({ length: count }, (_, n) => entry(n + 1));
  return {
    left: () => entries.map((e) => e.entryId),
    add: async (e) => {
      entries.push(e);
    },
    pending: async (limit) => entries.slice(0, limit),
    remove: async (ids) => {
      entries = entries.filter((e) => !ids.includes(e.entryId));
    },
  };
}

const acceptAll = async (batch: FeedEntry[]): Promise<BatchReceipt> => ({
  accepted: batch.map((e) => e.entryId),
  rejected: [],
});

describe("the outbox", () => {
  it("forgets what the API accepted or rejected, both being final", () => {
    const batch = [entry(1), entry(2), entry(3)];
    assert.deepEqual(
      settledEntryIds(batch, {
        accepted: [id(1)],
        rejected: [{ index: 2, entryId: null, reason: "too_late" }],
      }),
      [id(1), id(3)],
    );
  });

  it("sends a backlog in batches of 100 until it is empty", async () => {
    const store = memoryStore(250);
    const sizes: number[] = [];
    const result = await flushEntries(store, async (batch) => {
      sizes.push(batch.length);
      return acceptAll(batch);
    });
    assert.equal(result, "done");
    assert.deepEqual(sizes, [100, 100, 50]);
    assert.deepEqual(store.left(), []);
  });

  it("keeps everything when a send fails, for the next flush", async () => {
    const store = memoryStore(3);
    const result = await flushEntries(store, async () => {
      throw new Error("503 MEASUREMENT_QUEUE_FULL");
    });
    assert.equal(result, "failed");
    assert.equal(store.left().length, 3);
  });

  it("does nothing with nothing pending", async () => {
    let sent = 0;
    assert.equal(
      await flushEntries(memoryStore(0), async (batch) => {
        sent += 1;
        return acceptAll(batch);
      }),
      "done",
    );
    assert.equal(sent, 0);
  });
});

describe("memoryEntryStore", () => {
  it("keeps entries oldest first, once each, and drops the oldest past its cap", async () => {
    const store = memoryEntryStore(2);
    await store.add(entry(3));
    await store.add(entry(1));
    await store.add(entry(1));
    assert.deepEqual((await store.pending(10)).map((e) => e.entryId), [id(1), id(3)]);
    await store.add(entry(5));
    assert.deepEqual((await store.pending(10)).map((e) => e.entryId), [id(3), id(5)]);
    await store.remove([id(3)]);
    assert.deepEqual((await store.pending(10)).map((e) => e.entryId), [id(5)]);
  });
});

describe("the outbox's object", () => {
  const failingStore = (): EntryStore => ({
    add: async () => {
      throw new Error("QuotaExceededError");
    },
    pending: async () => {
      throw new Error("InvalidStateError");
    },
    remove: async () => undefined,
  });

  it("sends one flush at a time, a second request joining the first", async () => {
    const store = memoryEntryStore();
    await store.add(entry(1));
    let sends = 0;
    const answers: (() => void)[] = [];
    const outbox = createEntryOutbox({
      store,
      send: async (batch) => {
        sends += 1;
        await new Promise<void>((resolve) => answers.push(resolve));
        return acceptAll(batch);
      },
      beacon: () => undefined,
    });

    const first = outbox.flush();
    const second = outbox.flush();
    await new Promise((resolve) => setImmediate(resolve));
    for (const answer of answers) answer();
    assert.deepEqual(await Promise.all([first, second]), ["done", "done"]);
    assert.equal(sends, 1);
    assert.deepEqual(await store.pending(10), []);
    // Once it ends, the next request is a flush of its own.
    await outbox.flush();
    assert.equal(sends, 1, "nothing pending, nothing sent");
  });

  it("on leaving, beacons the closed entry at once and then the rest, keeping all of them", async () => {
    const store = memoryEntryStore();
    await store.add(entry(1));
    await store.add(entry(2));
    const beacons: string[][] = [];
    const outbox = createEntryOutbox({
      store,
      send: acceptAll,
      beacon: (batch) => beacons.push(batch.map((e) => e.entryId)),
    });

    const leaving = outbox.leave(entry(9));
    assert.deepEqual(beacons, [[id(9)]], "before the store answers");
    await leaving;
    assert.deepEqual(beacons, [[id(9)], [id(1), id(2)]]);
    assert.deepEqual(
      (await store.pending(10)).map((e) => e.entryId),
      [id(1), id(2), id(9)],
    );
  });

  it("beacons nothing more when nothing else is pending, and only the rest with nothing open", async () => {
    const beacons: string[][] = [];
    const beacon = (batch: readonly FeedEntry[]) =>
      beacons.push(batch.map((e) => e.entryId));
    await createEntryOutbox({ store: memoryEntryStore(), send: acceptAll, beacon }).leave(entry(9));
    assert.deepEqual(beacons, [[id(9)]]);

    beacons.length = 0;
    const store = memoryEntryStore();
    await store.add(entry(1));
    await createEntryOutbox({ store, send: acceptAll, beacon }).leave(null);
    assert.deepEqual(beacons, [[id(1)]]);
  });

  it("sends an entry the store refuses by beacon, and survives a store it cannot read", async () => {
    const beacons: string[][] = [];
    const outbox = createEntryOutbox({
      store: failingStore(),
      send: acceptAll,
      beacon: (batch) => beacons.push(batch.map((e) => e.entryId)),
    });

    await outbox.record(entry(1));
    assert.deepEqual(beacons, [[id(1)]]);
    await outbox.leave(entry(2));
    assert.deepEqual(beacons, [[id(1)], [id(2)]]);
    assert.equal(await outbox.flush(), "failed");
  });
});
