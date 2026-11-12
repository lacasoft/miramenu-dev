import type { CodeDelivery, CodeRequested } from "@miramenu/contracts";

/** What went wrong, and where the form shows it. */
export type RegistrationProblem =
  | { field: "phone"; reason: "phoneNotReachable" }
  | { field: "code"; reason: "codeInvalid" | "codeExpired" }
  | { field: "form"; reason: "wait"; seconds: number }
  | { field: "form"; reason: "privacyOutdated" | "invalid" | "unavailable" };

export type RegistrationState =
  | { step: "details"; problem: RegistrationProblem | null }
  | {
      step: "code";
      phone: string;
      delivery: CodeDelivery;
      /** When another code may be asked for (epoch ms). */
      resendAt: number;
      problem: RegistrationProblem | null;
    }
  | { step: "done" };

/** A failed call as the API client reports it; only what the flow needs. */
export interface RegistrationFailure {
  kind: string;
  status?: number;
  code?: string;
  retryAfterSeconds?: number;
}

export type RegistrationEvent =
  | { type: "codeRequested"; phone: string; answer: CodeRequested; now: number }
  | { type: "failed"; failure: RegistrationFailure; now: number }
  | { type: "verified" }
  | { type: "changePhone" };

export const REGISTRATION_START: RegistrationState = {
  step: "details",
  problem: null,
};

/** The API's wait before another code when a 429 does not say (ADR-0039: 60 s). */
const DEFAULT_WAIT_SECONDS = 60;

/**
 * Registration with a code (ADR-0039) as steps: the diner's details, then the code, then
 * done. Each failure lands where the diner can act on it: a phone that cannot get codes
 * goes back to the details, a wrong code stays on the code, a wait says how long, and an
 * outdated privacy notice asks to accept the current one.
 */
export function nextRegistration(
  state: RegistrationState,
  event: RegistrationEvent,
): RegistrationState {
  switch (event.type) {
    case "codeRequested":
      return {
        step: "code",
        phone: event.phone,
        delivery: event.answer.delivery,
        resendAt: event.now + event.answer.resendAfterSeconds * 1000,
        problem: null,
      };
    case "verified":
      return { step: "done" };
    case "changePhone":
      return REGISTRATION_START;
    case "failed":
      return afterFailure(state, event.failure, event.now);
  }
}

function afterFailure(
  state: RegistrationState,
  failure: RegistrationFailure,
  now: number,
): RegistrationState {
  if (state.step === "done") return state;
  const code = failure.kind === "http" ? failure.code : undefined;
  if (code === "PHONE_NOT_REACHABLE")
    return {
      step: "details",
      problem: { field: "phone", reason: "phoneNotReachable" },
    };
  if (code === "PRIVACY_NOTICE_OUTDATED")
    return {
      step: "details",
      problem: { field: "form", reason: "privacyOutdated" },
    };
  if (state.step === "code" && code === "CODE_INVALID")
    return { ...state, problem: { field: "code", reason: "codeInvalid" } };
  if (state.step === "code" && code === "CODE_EXPIRED")
    return {
      ...state,
      resendAt: now,
      problem: { field: "code", reason: "codeExpired" },
    };
  if (failure.kind === "http" && failure.status === 429) {
    const seconds = failure.retryAfterSeconds ?? DEFAULT_WAIT_SECONDS;
    const problem: RegistrationProblem = {
      field: "form",
      reason: "wait",
      seconds,
    };
    return state.step === "code"
      ? { ...state, resendAt: now + seconds * 1000, problem }
      : { ...state, problem };
  }
  if (failure.kind === "http" && failure.status === 400)
    return { ...state, problem: { field: "form", reason: "invalid" } };
  return { ...state, problem: { field: "form", reason: "unavailable" } };
}

/** Whole seconds until another code may be asked for; 0 once it may. */
export function secondsUntilResend(
  state: RegistrationState,
  now: number,
): number {
  return state.step === "code"
    ? Math.max(0, Math.ceil((state.resendAt - now) / 1000))
    : 0;
}
