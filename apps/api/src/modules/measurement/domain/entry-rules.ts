import {
  type BatchReceipt,
  type EntryRejection,
  FEED_ENTRY_LIMITS,
  type FeedExit,
  feedEntrySchema,
} from '@miramenu/contracts';
import { z } from 'zod';

const DAY_MS = 24 * 60 * 60 * 1000;

/** An entry ready for the queue, with what the server derives from it. */
export interface AcceptedEntry {
  entryId: string;
  branchId: string;
  dishId: string;
  enteredAt: Date;
  exposureMs: number;
  validView: boolean;
  exit: FeedExit;
  quickSkip: boolean;
}

/**
 * design: "El paso rápido mide solo los saltos manuales", and an abandonment is never
 * one. The demo's threshold: less than 2 s of exposure.
 */
export const isQuickSkip = (exit: FeedExit, exposureMs: number): boolean =>
  exit === 'manual' && exposureMs < FEED_ENTRY_LIMITS.quickSkipMs;

const idOf = (raw: unknown): string | null => {
  const id =
    typeof raw === 'object' && raw !== null && 'entryId' in raw
      ? raw.entryId
      : undefined;
  return z.uuid().safeParse(id).success ? (id as string) : null;
};

type Verdict =
  { ok: true; entry: AcceptedEntry } | { ok: false; reason: EntryRejection };

/** One entry against its schema and the time it was received. */
export function judgeEntry(raw: unknown, receivedAt: Date): Verdict {
  const parsed = feedEntrySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'invalid' };
  const enteredAt = new Date(parsed.data.enteredAt);
  const now = receivedAt.getTime();
  if (enteredAt.getTime() < now - FEED_ENTRY_LIMITS.lateDays * DAY_MS)
    return { ok: false, reason: 'too_late' };
  if (enteredAt.getTime() > now + FEED_ENTRY_LIMITS.futureMs)
    return { ok: false, reason: 'in_future' };
  const { entryId, branchId, dishId, exposureMs, validView, exit } =
    parsed.data;
  return {
    ok: true,
    entry: {
      entryId,
      branchId,
      dishId,
      enteredAt,
      exposureMs,
      validView,
      exit,
      quickSkip: isQuickSkip(exit, exposureMs),
    },
  };
}

/**
 * Every entry of a batch, each on its own (design: "responde por evento"). An entry id
 * repeated within the batch counts once; the copies are rejected.
 */
export function judgeBatch(
  entries: readonly unknown[],
  receivedAt: Date,
): { accepted: AcceptedEntry[]; receipt: BatchReceipt } {
  const accepted: AcceptedEntry[] = [];
  const receipt: BatchReceipt = { accepted: [], rejected: [] };
  const seen = new Set<string>();
  entries.forEach((raw, index) => {
    const verdict = judgeEntry(raw, receivedAt);
    if (!verdict.ok) {
      receipt.rejected.push({
        index,
        entryId: idOf(raw),
        reason: verdict.reason,
      });
      return;
    }
    if (seen.has(verdict.entry.entryId)) {
      receipt.rejected.push({
        index,
        entryId: verdict.entry.entryId,
        reason: 'repeated_in_batch',
      });
      return;
    }
    seen.add(verdict.entry.entryId);
    accepted.push(verdict.entry);
    receipt.accepted.push(verdict.entry.entryId);
  });
  return { accepted, receipt };
}
