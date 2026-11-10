/** The states of a comment; deleted ones are kept but never shown to anyone. */
export type CommentStatus = 'pending' | 'approved' | 'rejected' | 'deleted';

/** Who a like belongs to: the registered diner, or else the anonymous device. */
export type LikeOwner =
  | { kind: 'diner'; dinerId: string; deviceId: string | null }
  | { kind: 'device'; deviceId: string };

/**
 * The like's key (design: "comensal o dispositivo"): a registered diner likes as their
 * account, from any device; an anonymous one as their device. Null if neither is known.
 */
export function likeOwnerOf(identity: {
  deviceId: string | null;
  diner: { id: string } | null;
}): LikeOwner | null {
  if (identity.diner)
    return {
      kind: 'diner',
      dinerId: identity.diner.id,
      deviceId: identity.deviceId,
    };
  return identity.deviceId
    ? { kind: 'device', deviceId: identity.deviceId }
    : null;
}

/**
 * A moderator may decide only on the comment they read: still pending, and with the
 * version they saw. An edit in between, or another moderator first, is a conflict.
 */
export function mayModerate(
  comment: { status: CommentStatus; version: number },
  seenVersion: number,
): boolean {
  return comment.status === 'pending' && comment.version === seenVersion;
}

/** The moment from which a comment still pending is overdue for its moderators. */
export function overdueSince(now: Date, overdueHours: number): Date {
  return new Date(now.getTime() - overdueHours * 60 * 60 * 1000);
}

export const isOverdue = (
  submittedAt: Date,
  now: Date,
  overdueHours: number,
): boolean =>
  submittedAt.getTime() <= overdueSince(now, overdueHours).getTime();
