import {
  FEED_ENTRY_LIMITS,
  type BatchReceipt,
  type FeedEntry,
} from "@miramenu/contracts";

/**
 * Where closed entries wait on the device until the API confirms them (ADR-0011): IndexedDB
 * on the web. They survive a lost network and a closed tab, and go out at the next visit.
 */
export interface EntryStore {
  add(entry: FeedEntry): Promise<void>;
  /** The oldest pending entries first. */
  pending(limit: number): Promise<FeedEntry[]>;
  remove(entryIds: readonly string[]): Promise<void>;
}

/** The entries a receipt settles: accepted and rejected alike, both final (ADR-0041). */
export function settledEntryIds(
  batch: readonly FeedEntry[],
  receipt: BatchReceipt,
): string[] {
  const rejected = receipt.rejected
    .map(({ index }) => batch[index]?.entryId)
    .filter((entryId): entryId is string => entryId !== undefined);
  return [...new Set([...receipt.accepted, ...rejected])];
}

/** Batches sent per flush at most, so a long backlog never blocks the page. */
const MAX_BATCHES_PER_FLUSH = 10;

export type FlushResult = "done" | "failed";

/**
 * Sends what is pending, a full batch at a time, and forgets what the API settled. A failed
 * send (no network, a 503 with the queue full) keeps everything for the next flush: the
 * API counts each entry once, so sending one twice is harmless.
 */
export async function flushEntries(
  store: EntryStore,
  send: (entries: FeedEntry[]) => Promise<BatchReceipt>,
): Promise<FlushResult> {
  for (let round = 0; round < MAX_BATCHES_PER_FLUSH; round += 1) {
    const batch = await store.pending(FEED_ENTRY_LIMITS.entriesPerBatch);
    if (batch.length === 0) return "done";
    let receipt: BatchReceipt;
    try {
      receipt = await send(batch);
    } catch {
      return "failed";
    }
    await store.remove(settledEntryIds(batch, receipt));
    if (batch.length < FEED_ENTRY_LIMITS.entriesPerBatch) return "done";
  }
  return "done";
}

/** Entries kept on the device at most; past it the oldest go first (the API refuses them after 7 days anyway). */
export const MAX_KEPT_ENTRIES = 1000;

/**
 * An EntryStore in memory: the fallback when the platform's storage is refused (a private
 * window), and the store of the tests. It lasts this visit only.
 */
export function memoryEntryStore(cap: number = MAX_KEPT_ENTRIES): EntryStore {
  let entries: FeedEntry[] = [];
  return {
    add: async (entry) => {
      entries = [...entries.filter((kept) => kept.entryId !== entry.entryId), entry]
        .sort((a, b) => a.enteredAt.localeCompare(b.enteredAt))
        .slice(-cap);
    },
    pending: async (limit) => entries.slice(0, limit),
    remove: async (entryIds) => {
      entries = entries.filter((entry) => !entryIds.includes(entry.entryId));
    },
  };
}

/** What the outbox needs from the platform and the API. */
export interface EntryOutboxPorts {
  store: EntryStore;
  send: (entries: FeedEntry[]) => Promise<BatchReceipt>;
  /** Hands a batch to the platform to deliver even as the page goes away; its outcome is never known. */
  beacon: (entries: readonly FeedEntry[]) => void;
}

/** Closed entries on their way to the API, from the moment they close until it settles them. */
export interface EntryOutbox {
  /** Keeps a closed entry for the next flush; one the store refuses goes out by beacon at once. */
  record(entry: FeedEntry): Promise<void>;
  /** Sends what is pending; asked while a flush runs, it joins that one instead of sending twice. */
  flush(): Promise<FlushResult>;
  /**
   * The page is going away (ADR-0011): the entry it closed goes out by beacon first, before
   * the store even answers, then the rest of what is pending. Nothing is forgotten, since a
   * beacon's outcome is unknown: the next flush confirms it, and the API counts each entry once.
   */
  leave(closed: FeedEntry | null): Promise<void>;
}

export function createEntryOutbox({
  store,
  send,
  beacon,
}: EntryOutboxPorts): EntryOutbox {
  let flushing: Promise<FlushResult> | null = null;

  const flush = async (): Promise<FlushResult> => {
    try {
      return await flushEntries(store, send);
    } catch {
      // The store could not be read or updated: what it holds waits for the next flush.
      return "failed";
    }
  };

  return {
    async record(entry) {
      try {
        await store.add(entry);
      } catch {
        beacon([entry]);
      }
    },
    flush() {
      flushing ??= flush().finally(() => {
        flushing = null;
      });
      return flushing;
    },
    async leave(closed) {
      if (closed !== null) {
        beacon([closed]);
        try {
          await store.add(closed);
        } catch {
          // Already handed to the beacon above; the store simply cannot keep a copy of it.
        }
      }
      let rest: FeedEntry[];
      try {
        rest = await store.pending(FEED_ENTRY_LIMITS.entriesPerBatch);
      } catch {
        return; // Unreadable now: what it holds goes out with the next flush.
      }
      const others = rest.filter((entry) => entry.entryId !== closed?.entryId);
      if (others.length > 0) beacon(others);
    },
  };
}
