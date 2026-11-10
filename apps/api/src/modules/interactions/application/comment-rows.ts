import type { OwnComment } from '@miramenu/contracts';
import type { CommentStatus } from '../domain/interaction-rules';

export const COMMENT_COLUMNS =
  'id, branch_id, dish_id, diner_id, text, status, version, submitted_at, approved_at, created_at';

export interface CommentRow {
  id: string;
  branch_id: string;
  dish_id: string;
  diner_id: string;
  text: string;
  status: CommentStatus;
  version: number;
  submitted_at: Date;
  approved_at: Date | null;
  created_at: Date;
}

/** The author's view of a comment; deleted comments are never handed out. */
export function ownCommentOf(row: CommentRow): OwnComment {
  if (row.status === 'deleted')
    throw new Error('A deleted comment has no view');
  return {
    id: row.id,
    branchId: row.branch_id,
    dishId: row.dish_id,
    text: row.text,
    status: row.status,
    version: row.version,
    submittedAt: row.submitted_at.toISOString(),
  };
}
