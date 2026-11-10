import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type {
  createCommentSchema,
  OwnComment,
  Page,
  PageQuery,
  PublicComment,
} from '@miramenu/contracts';
import type { DataSource } from 'typeorm';
import type { z } from 'zod';
import {
  changeRows,
  returningRows,
  selectRows,
} from '../../../infrastructure/database/query';
import {
  decodeCursor,
  toPage,
} from '../../../infrastructure/http/keyset-cursor';
import { MenuDishes } from '../../catalog';
import { DinerDirectory } from '../../diners';
import { CommentLimits } from './comment-limits';
import { COMMENT_COLUMNS, type CommentRow, ownCommentOf } from './comment-rows';
import { clientIdReused, dishNotOnMenu, notFound } from './errors';

type NewComment = z.output<typeof createCommentSchema>;

/**
 * Comments of a dish in a branch (design: "Interacciones: comentarios"). Only registered
 * diners comment; every comment, and every edit, waits for a moderator (ADR-0008), and
 * only approved ones are public. Deleting one is logical: it is kept, never shown.
 */
@Injectable()
export class CommentsService {
  constructor(
    @InjectDataSource('interactions') private readonly dataSource: DataSource,
    private readonly menuDishes: MenuDishes,
    private readonly limits: CommentLimits,
    private readonly directory: DinerDirectory,
  ) {}

  /** created is false when the client retried a comment it had already posted. */
  async create(
    dinerId: string,
    input: NewComment,
    now: Date,
  ): Promise<{ comment: OwnComment; created: boolean }> {
    const earlier = await this.byClientId(dinerId, input.clientId);
    if (earlier)
      return { comment: this.replayed(earlier, input), created: false };
    if (!(await this.menuDishes.isOnMenu(input.branchId, input.dishId)))
      throw dishNotOnMenu();
    await this.limits.consume(dinerId);
    const [row] = await selectRows<CommentRow>(
      this.dataSource.manager,
      `INSERT INTO interactions.comment (branch_id, dish_id, diner_id, client_id, text, submitted_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $6, $6)
       ON CONFLICT (diner_id, client_id) DO NOTHING
       RETURNING ${COMMENT_COLUMNS}`,
      [input.branchId, input.dishId, dinerId, input.clientId, input.text, now],
    );
    if (row) return { comment: ownCommentOf(row), created: true };
    // Two retries raced: the other one inserted it.
    const raced = await this.byClientId(dinerId, input.clientId);
    if (!raced) throw new Error('A comment conflicted and then vanished');
    return { comment: this.replayed(raced, input), created: false };
  }

  /** An edit goes back to moderation, even of an approved comment (design). */
  async edit(
    dinerId: string,
    commentId: string,
    text: string,
    now: Date,
  ): Promise<OwnComment> {
    const current = await this.own(dinerId, commentId);
    // The same text again has nothing new to moderate.
    if (current.text === text) return ownCommentOf(current);
    await this.limits.consume(dinerId);
    const [row] = await returningRows<CommentRow>(
      this.dataSource.manager,
      `UPDATE interactions.comment SET text = $3, status = 'pending', version = version + 1,
         submitted_at = $4, approved_at = NULL, moderated_at = NULL, moderated_by = NULL,
         updated_at = $4
       WHERE id = $1 AND diner_id = $2 AND status <> 'deleted'
       RETURNING ${COMMENT_COLUMNS}`,
      [commentId, dinerId, text, now],
    );
    if (!row) throw notFound();
    return ownCommentOf(row);
  }

  async remove(dinerId: string, commentId: string, now: Date): Promise<void> {
    const changed = await changeRows(
      this.dataSource.manager,
      `UPDATE interactions.comment SET status = 'deleted', approved_at = NULL, updated_at = $3
       WHERE id = $1 AND diner_id = $2 AND status <> 'deleted'`,
      [commentId, dinerId, now],
    );
    if (changed === 0) throw notFound();
  }

  /** The author's own comments, newest first, in every state but deleted. */
  async mine(dinerId: string, query: PageQuery): Promise<Page<OwnComment>> {
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    const rows = await selectRows<CommentRow>(
      this.dataSource.manager,
      `SELECT ${COMMENT_COLUMNS} FROM interactions.comment
       WHERE diner_id = $1 AND status <> 'deleted'
         AND ($2::timestamptz IS NULL OR (created_at, id) < ($2, $3::uuid))
       ORDER BY created_at DESC, id DESC LIMIT $4`,
      [dinerId, cursor?.createdAt ?? null, cursor?.id ?? null, query.limit + 1],
    );
    return toPage(
      rows.map((row) => ({ ...row, createdAt: row.created_at })),
      query.limit,
      ownCommentOf,
    );
  }

  /** What everyone sees: approved comments, newest first, with only the author's name. */
  async approved(
    branchId: string,
    dishId: string,
    query: PageQuery,
  ): Promise<Page<PublicComment>> {
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    const rows = await selectRows<CommentRow & { approved_at: Date }>(
      this.dataSource.manager,
      `SELECT ${COMMENT_COLUMNS} FROM interactions.comment
       WHERE branch_id = $1 AND dish_id = $2 AND status = 'approved'
         AND ($3::timestamptz IS NULL OR (approved_at, id) < ($3, $4::uuid))
       ORDER BY approved_at DESC, id DESC LIMIT $5`,
      [
        branchId,
        dishId,
        cursor?.createdAt ?? null,
        cursor?.id ?? null,
        query.limit + 1,
      ],
    );
    const names = await this.directory.publicNames(
      rows.map((row) => row.diner_id),
    );
    return toPage(
      rows.map((row) => ({ ...row, createdAt: row.approved_at })),
      query.limit,
      (row) => ({
        id: row.id,
        text: row.text,
        // Accounts are never deleted today, so every author has a name.
        author: { name: names.get(row.diner_id) ?? '' },
        approvedAt: row.approved_at.toISOString(),
      }),
    );
  }

  private async own(dinerId: string, commentId: string): Promise<CommentRow> {
    const [row] = await selectRows<CommentRow>(
      this.dataSource.manager,
      `SELECT ${COMMENT_COLUMNS} FROM interactions.comment
       WHERE id = $1 AND diner_id = $2 AND status <> 'deleted'`,
      [commentId, dinerId],
    );
    // Someone else's comment is not found, never forbidden: its existence is not shown.
    if (!row) throw notFound();
    return row;
  }

  private async byClientId(
    dinerId: string,
    clientId: string,
  ): Promise<CommentRow | null> {
    const [row] = await selectRows<CommentRow>(
      this.dataSource.manager,
      `SELECT ${COMMENT_COLUMNS} FROM interactions.comment WHERE diner_id = $1 AND client_id = $2`,
      [dinerId, clientId],
    );
    return row ?? null;
  }

  /** A retry is the same comment only if it asks for the same thing. */
  private replayed(earlier: CommentRow, input: NewComment): OwnComment {
    const same =
      earlier.status !== 'deleted' &&
      earlier.branch_id === input.branchId &&
      earlier.dish_id === input.dishId &&
      earlier.text === input.text;
    if (!same) throw clientIdReused();
    return ownCommentOf(earlier);
  }
}
