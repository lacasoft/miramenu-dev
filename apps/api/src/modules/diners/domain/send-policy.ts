/**
 * Where a send of a code stands. sending: written before calling the provider, so its
 * report finds it. unknown: the provider did not answer in time (design, step 2).
 * rejected and unavailable: the code did not leave. accepted, delivered and failed come
 * from the provider, at once or later in its signed reports.
 */
export type SendState =
  | 'sending'
  | 'unknown'
  | 'rejected'
  | 'unavailable'
  | 'accepted'
  | 'delivered'
  | 'failed';

const FINAL_STATES: ReadonlySet<SendState> = new Set([
  'delivered',
  'failed',
  'rejected',
  'unavailable',
]);

export const isFinalSendState = (state: SendState): boolean =>
  FINAL_STATES.has(state);

/**
 * The state after a report. Reports may arrive out of order (Twilio says so): once a
 * send is delivered or failed, a late "accepted" does not take it back.
 */
export function nextSendState(
  current: SendState,
  reported: 'accepted' | 'delivered' | 'failed',
): SendState {
  return isFinalSendState(current) ? current : reported;
}

/**
 * Seconds before another code may go to the same phone (design: "tras 60 s"), or 0. A
 * send the provider reports as failed never arrives, so the diner need not wait for it.
 */
export function resendWaitSeconds(
  previous: { sentAtMs: number; state: SendState | null } | null,
  nowMs: number,
  resendSeconds: number,
): number {
  if (previous === null || previous.state === 'failed') return 0;
  const remainingMs = previous.sentAtMs + resendSeconds * 1000 - nowMs;
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
}

/** One send limit: at most `max` sends per `windowSeconds`, counted in a fixed window. */
export interface SendLimit {
  key: string;
  max: number;
  windowSeconds: number;
}

/**
 * Seconds until every exceeded limit frees up, or 0 if none is. Each count already
 * includes the send being asked for.
 */
export function limitWaitSeconds(
  counts: readonly { count: number; ttlMs: number; max: number }[],
): number {
  const waits = counts
    .filter(({ count, max }) => count > max)
    .map(({ ttlMs }) => Math.max(1, Math.ceil(ttlMs / 1000)));
  return waits.length > 0 ? Math.max(...waits) : 0;
}
