import type { CallFailure } from "./failures.ts";

/** Why signing in failed, as the form tells it. */
export type SignInProblem =
  /** Wrong email or password, never which of the two (ADR-0021). */
  | { reason: "invalidCredentials" }
  /** Too many tries: when the form may try again (epoch ms). */
  | { reason: "wait"; until: number }
  | { reason: "invalid" }
  | { reason: "unavailable" };

/** What the API says when it gives no Retry-After with its 429. */
const DEFAULT_WAIT_SECONDS = 60;

export function signInProblemOf(failure: CallFailure, now: number): SignInProblem {
  if (failure.kind === "http" && failure.status === 401) return { reason: "invalidCredentials" };
  if (failure.kind === "http" && failure.status === 429)
    return {
      reason: "wait",
      until: now + (failure.retryAfterSeconds ?? DEFAULT_WAIT_SECONDS) * 1000,
    };
  if (failure.kind === "http" && failure.status === 400) return { reason: "invalid" };
  // LOGIN_UNAVAILABLE (Redis down, the login closes), any other outage, no network.
  return { reason: "unavailable" };
}

/** Whole seconds left until `until`, never below zero. */
export const secondsUntil = (until: number, now: number): number =>
  Math.max(0, Math.ceil((until - now) / 1000));
