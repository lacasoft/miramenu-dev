import type { BatchReceipt, FeedEntry } from "@miramenu/contracts";
import { createEntryOutbox, memoryEntryStore } from "@miramenu/diner-core";

type Send = (entries: FeedEntry[]) => Promise<BatchReceipt>;

/** The real outbox over a store in memory, with what it sent and beaconed on record. */
export function testOutbox(send?: Send) {
  const store = memoryEntryStore();
  const sent: FeedEntry[][] = [];
  const beacons: FeedEntry[][] = [];
  const acceptAll: Send = async (entries) => ({
    accepted: entries.map((entry) => entry.entryId),
    rejected: [],
  });
  const outbox = createEntryOutbox({
    store,
    send: (entries) => {
      sent.push(entries);
      return (send ?? acceptAll)(entries);
    },
    beacon: (entries) => {
      beacons.push([...entries]);
    },
  });
  return { outbox, store, sent, beacons };
}
