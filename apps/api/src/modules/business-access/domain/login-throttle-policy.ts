/** ADR-0021: failures are counted in a 15-minute window, by email and by IP. */
export const FAILURE_WINDOW_SECONDS = 15 * 60;

const FIRST_DELAYED_FAILURE = 5;
const MAX_WAIT_SECONDS = 15 * 60;

/**
 * Wait imposed after the given number of failures: nothing for the first four, then
 * 1 s, 2 s, 4 s… doubling up to 15 minutes. The account is never locked.
 */
export function waitAfterFailures(failures: number): number {
  if (failures < FIRST_DELAYED_FAILURE) return 0;
  return Math.min(2 ** (failures - FIRST_DELAYED_FAILURE), MAX_WAIT_SECONDS);
}

/** Whole seconds the caller still has to wait, for the Retry-After header; 0 if none. */
export function remainingWaitSeconds(
  failures: number,
  lastFailureAtMs: number,
  nowMs: number,
): number {
  const remainingMs =
    lastFailureAtMs + waitAfterFailures(failures) * 1000 - nowMs;
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
}
