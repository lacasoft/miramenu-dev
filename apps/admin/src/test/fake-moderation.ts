import type { ModerationQuery } from "@miramenu/api-client";
import type { ModerationItem, SessionActor } from "@miramenu/contracts";
import { vi } from "vitest";
import { httpError, id } from "./fake-admin";
import { accessIn, type World } from "./fake-world";

/** A comment in memory: what a moderator sees of it, and where it stands. */
export interface FakeComment extends ModerationItem {
  status: "pending" | "approved" | "rejected";
}

export const commentOf = (
  n: number,
  branchId: string,
  text: string,
  extra: Partial<FakeComment> = {},
): FakeComment => ({
  id: id(n),
  branchId,
  dishId: id(30),
  dishName: "Pastor",
  text,
  author: { name: "Dana" },
  version: 1,
  submittedAt: `2026-11-13T${String(10 + (n % 10)).padStart(2, "0")}:00:00.000Z`,
  overdue: false,
  status: "pending",
  ...extra,
});

/** What the API sends of a comment: everything but where it stands. */
const itemOf = (comment: FakeComment): ModerationItem => ({
  id: comment.id,
  branchId: comment.branchId,
  dishId: comment.dishId,
  dishName: comment.dishName,
  text: comment.text,
  author: { ...comment.author },
  version: comment.version,
  submittedAt: comment.submittedAt,
  overdue: comment.overdue,
});

/** How many comments a page of the fake queue holds: small, so paging can be seen. */
export const QUEUE_PAGE = 3;

/** The moderation calls over a world, as the given person: the API's rules (ADR-0040). */
export function moderationApi(world: World, actor: () => SessionActor | null) {
  const { visible, businessAt, branchAt } = accessIn(world, actor);
  const page = (
    branchIds: readonly string[],
    { cursor, overdue }: ModerationQuery,
  ) => {
    const pending = (world.comments ?? [])
      .filter(
        (each) =>
          each.status === "pending" && branchIds.includes(each.branchId),
      )
      .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
    const shown = pending.filter((each) => overdue !== true || each.overdue);
    const start = cursor === undefined ? 0 : Number(cursor.slice(2));
    const items = shown
      .slice(start, start + QUEUE_PAGE)
      .map(itemOf);
    const more = start + QUEUE_PAGE < shown.length;
    return {
      items,
      nextCursor: more ? `c_${start + QUEUE_PAGE}` : null,
      overdueCount: pending.filter((each) => each.overdue).length,
    };
  };
  const decide = (status: "approved" | "rejected") =>
    vi.fn(async (commentId: string, version: number) => {
      const comment = (world.comments ?? []).find(
        (each) => each.id === commentId,
      );
      if (comment === undefined) throw httpError(404, "NOT_FOUND");
      branchAt(comment.branchId);
      if (comment.status !== "pending" || comment.version !== version)
        throw httpError(409, "COMMENT_CHANGED");
      comment.status = status;
    });

  return {
    businessModeration: vi.fn(
      async (businessId: string, query: ModerationQuery = {}) => {
        businessAt(businessId);
        if (!visible(businessId).owner) throw httpError(403, "FORBIDDEN");
        const branchIds = world.branches
          .filter((each) => each.businessId === businessId)
          .map((each) => each.id);
        return page(branchIds, query);
      },
    ),
    branchModeration: vi.fn(
      async (branchId: string, query: ModerationQuery = {}) => {
        branchAt(branchId);
        return page([branchId], query);
      },
    ),
    approveComment: decide("approved"),
    rejectComment: decide("rejected"),
  };
}
