import type {
  BusinessMenuDraft,
  ConflictRef,
  PublicationConflict,
  PublishBusinessMenuRequest,
} from "@miramenu/contracts";
import type { CallFailure } from "./failures.ts";

/**
 * One conflict as the admin confirms it: its branch, its dish and why. A conflict whose
 * reason changes is a new one to confirm.
 */
export const conflictKeyOf = (conflict: PublicationConflict): string =>
  `${conflict.branchId}:${conflict.dishId}:${conflict.reason}`;

/**
 * What publishing the reviewed draft asks for: its version and the conflicts the admin
 * confirmed among the current ones, as plain references. A confirmation of a conflict
 * that is gone does not travel; a current one left unconfirmed is counted as missing.
 */
export function publicationOf(
  draft: Pick<BusinessMenuDraft, "draftVersion" | "conflicts">,
  confirmed: ReadonlySet<string>,
): { request: PublishBusinessMenuRequest; missing: number } {
  const confirmedConflicts: ConflictRef[] = draft.conflicts
    .filter((conflict) => confirmed.has(conflictKeyOf(conflict)))
    .map(({ branchId, dishId }) => ({ branchId, dishId }));
  return {
    request: { draftVersion: draft.draftVersion, confirmedConflicts },
    missing: draft.conflicts.length - confirmedConflicts.length,
  };
}

/** A publication on its way: its request and the idempotency key that goes with it. */
export interface PublicationAttempt {
  request: PublishBusinessMenuRequest;
  key: string;
}

const sameRequest = (
  a: PublishBusinessMenuRequest,
  b: PublishBusinessMenuRequest,
) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The key stays with its request until the publication goes out, so a retry after a lost
 * answer gives back the first publication instead of a second one. Another request
 * (the draft or the confirmations changed) takes a new key: the API refuses an old key
 * with another body (IDEMPOTENCY_KEY_REUSED).
 */
export function attemptOf(
  previous: PublicationAttempt | null,
  request: PublishBusinessMenuRequest,
  freshKey: () => string,
): PublicationAttempt {
  return previous !== null && sameRequest(previous.request, request)
    ? previous
    : { request, key: freshKey() };
}

/** What the API's answer to publishing means for the admin. */
export type PublishProblem =
  | "draftChanged"
  | "conflictsChanged"
  | "profileRequired"
  | "keyReused"
  | "forbidden"
  | "notFound"
  | "invalid"
  | "unavailable";

const PUBLISH_CODES: Readonly<Record<string, PublishProblem>> = {
  DRAFT_CHANGED: "draftChanged",
  PUBLICATION_CONFLICTS: "conflictsChanged",
  PROFILE_REQUIRED: "profileRequired",
  IDEMPOTENCY_KEY_REUSED: "keyReused",
};

export function publishProblemOf(failure: CallFailure): PublishProblem {
  if (failure.kind !== "http") return "unavailable";
  const known =
    failure.code === undefined ? undefined : PUBLISH_CODES[failure.code];
  if (known !== undefined) return known;
  if (failure.status === 403) return "forbidden";
  if (failure.status === 404) return "notFound";
  if (failure.status === 400) return "invalid";
  return "unavailable";
}

/**
 * Whether the same attempt may go again as it is. Only when the answer never said it was
 * refused (a lost answer or an outage): the first try may have published.
 */
export const keepsAttempt = (problem: PublishProblem): boolean =>
  problem === "unavailable";

/** Whether the draft must be read again before the admin reviews it once more. */
export const rereadsDraft = (problem: PublishProblem): boolean =>
  problem === "draftChanged" ||
  problem === "conflictsChanged" ||
  problem === "profileRequired";
