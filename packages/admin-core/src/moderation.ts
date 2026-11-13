import type { CallFailure } from "./failures.ts";

/** What the API's answer to approving or rejecting a comment means for the moderator. */
export type ModerationProblem = "changed" | "gone" | "forbidden" | "unavailable";

/**
 * A 409 COMMENT_CHANGED: its author edited it or someone else moderated it after it was
 * read (ADR-0040); the queue is read again to show it as it is now.
 */
export function moderationProblemOf(failure: CallFailure): ModerationProblem {
  if (failure.kind !== "http") return "unavailable";
  if (failure.code === "COMMENT_CHANGED") return "changed";
  if (failure.status === 404) return "gone";
  if (failure.status === 403) return "forbidden";
  return "unavailable";
}

/** Whether the queue must be read again: what was decided on is no longer what is there. */
export const rereadsQueue = (problem: ModerationProblem): boolean => problem === "changed" || problem === "gone";
