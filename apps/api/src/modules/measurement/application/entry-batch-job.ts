import type { FeedExit } from '@miramenu/contracts';
import type { AcceptedEntry } from '../domain/entry-rules';

export const MEASUREMENT_QUEUE = 'measurement-batches';
/** design, paso 5: a batch that fails 3 times is set apart (BullMQ's failed list). */
export const ENTRY_BATCH_ATTEMPTS = 3;

/** A batch as it waits in Redis: plain JSON, dates as ISO strings. */
export interface EntryBatchJob {
  deviceId: string;
  receivedAt: string;
  entries: {
    entryId: string;
    branchId: string;
    dishId: string;
    enteredAt: string;
    exposureMs: number;
    validView: boolean;
    exit: FeedExit;
    quickSkip: boolean;
  }[];
}

export function toJob(
  deviceId: string,
  receivedAt: Date,
  entries: readonly AcceptedEntry[],
): EntryBatchJob {
  return {
    deviceId,
    receivedAt: receivedAt.toISOString(),
    entries: entries.map((entry) => ({
      ...entry,
      enteredAt: entry.enteredAt.toISOString(),
    })),
  };
}
