import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  secretTokenSchema,
} from "@miramenu/contracts";
import type { CallFailure } from "./failures.ts";
import { paramsOf } from "./query.ts";

/** The invitation's token from the link's fragment (`#token=…`, ADR-0033); null if none fits. */
export function invitationTokenOf(fragment: string): string | null {
  const token = paramsOf(fragment).get("token") ?? null;
  return token !== null && secretTokenSchema.safeParse(token).success ? token : null;
}

export type PasswordProblem = "tooShort" | "tooLong" | "mismatch";

/**
 * The new password, as the API will judge it (ADR-0034): 12 to 128 characters, counted
 * as the API counts them (code points, so an emoji is one). The confirmation must match.
 */
export function passwordProblemOf(password: string, confirmation: string): PasswordProblem | null {
  const length = [...password].length;
  if (length < PASSWORD_MIN_LENGTH) return "tooShort";
  if (length > PASSWORD_MAX_LENGTH) return "tooLong";
  return password === confirmation ? null : "mismatch";
}

export type InvitationProblem = "used" | "expired" | "invalid" | "unavailable";

/** A used or replaced invitation is a 404, an expired one a 410 (ADR-0023). */
export function invitationProblemOf(failure: CallFailure): InvitationProblem {
  if (failure.kind === "http" && failure.status === 404) return "used";
  if (failure.kind === "http" && failure.status === 410) return "expired";
  if (failure.kind === "http" && failure.status === 400) return "invalid";
  return "unavailable";
}
