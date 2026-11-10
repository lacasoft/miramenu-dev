import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type {
  ModerationPage,
  moderationQuerySchema,
} from '@miramenu/contracts';
import type { DataSource } from 'typeorm';
import type { z } from 'zod';
import { APP_CONFIG } from '../../../infrastructure/config/config.module';
import type { AppConfig } from '../../../infrastructure/config/environment';
import { changeRows, selectRows } from '../../../infrastructure/database/query';
import {
  decodeCursor,
  toPage,
} from '../../../infrastructure/http/keyset-cursor';
import {
  AccessControl,
  type Actor,
  BranchDirectory,
} from '../../business-access';
import { DinerDirectory } from '../../diners';
import {
  type CommentStatus,
  mayModerate,
  overdueSince,
} from '../domain/interaction-rules';
import { commentChanged, notFound } from './errors';

type ModerationQuery = z.output<typeof moderationQuerySchema>;
export type Decision = 'approved' | 'rejected';

interface PendingRow {
  id: string;
  branch_id: string;
  dish_id: string;
  diner_id: string;
  text: string;
  version: number;
  submitted_at: Date;
}

/**
 * Moderation (ADR-0008, ADR-0040): the business admin, the admin of the comment's branch
 * and the superadmin, at the "operate" level, checked in one place by Business & access
 * before anything is read or changed (ADR-0019): 404 outside the scope, 403 inside it.
 */
@Injectable()
export class ModerationService {
  private readonly overdueHours: number;

  constructor(
    @InjectDataSource('interactions') private readonly dataSource: DataSource,
    private readonly access: AccessControl,
    private readonly branches: BranchDirectory,
    private readonly diners: DinerDirectory,
    @Inject(APP_CONFIG) config: AppConfig,
  ) {
    this.overdueHours = config.interactions.commentOverdueHours;
  }

  async pendingOfBusiness(
    actor: Actor,
    businessId: string,
    query: ModerationQuery,
    now: Date,
  ): Promise<ModerationPage> {
    this.access.assertBusiness(actor, businessId, 'operate');
    const branchIds = await this.branches.branchIdsOf(businessId);
    if (branchIds === null) throw notFound();
    return this.pending(branchIds, query, now);
  }

  async pendingOfBranch(
    actor: Actor,
    branchId: string,
    query: ModerationQuery,
    now: Date,
  ): Promise<ModerationPage> {
    await this.access.assertBranch(actor, branchId, 'operate');
    return this.pending([branchId], query, now);
  }

  /** Decides on the version the moderator read; anything newer is a 409. */
  async decide(
    actor: Actor,
    commentId: string,
    seenVersion: number,
    decision: Decision,
    now: Date,
  ): Promise<void> {
    const [comment] = await selectRows<{
      branch_id: string;
      status: CommentStatus;
      version: number;
    }>(
      this.dataSource.manager,
      `SELECT branch_id, status, version FROM interactions.comment WHERE id = $1`,
      [commentId],
    );
    if (!comment || comment.status === 'deleted') throw notFound();
    await this.access.assertBranch(actor, comment.branch_id, 'operate');
    if (!mayModerate(comment, seenVersion)) throw commentChanged();
    const changed = await changeRows(
      this.dataSource.manager,
      `UPDATE interactions.comment SET status = $3,
         approved_at = CASE WHEN $3 = 'approved' THEN $4::timestamptz ELSE NULL END,
         moderated_at = $4, moderated_by = $5, updated_at = $4
       WHERE id = $1 AND status = 'pending' AND version = $2`,
      [commentId, seenVersion, decision, now, actor.userId],
    );
    // An edit or another moderator got in between the check and the update.
    if (changed === 0) throw commentChanged();
  }

  /** Oldest first, as a queue; overdue ones are flagged and counted (design: 24 h). */
  private async pending(
    branchIds: readonly string[],
    query: ModerationQuery,
    now: Date,
  ): Promise<ModerationPage> {
    const threshold = overdueSince(now, this.overdueHours);
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    const rows = await selectRows<PendingRow>(
      this.dataSource.manager,
      `SELECT id, branch_id, dish_id, diner_id, text, version, submitted_at
       FROM interactions.comment
       WHERE status = 'pending' AND branch_id = ANY($1::uuid[])
         AND (NOT $2::boolean OR submitted_at <= $3)
         AND ($4::timestamptz IS NULL OR (submitted_at, id) > ($4, $5::uuid))
       ORDER BY submitted_at, id LIMIT $6`,
      [
        branchIds,
        query.overdue,
        threshold,
        cursor?.createdAt ?? null,
        cursor?.id ?? null,
        query.limit + 1,
      ],
    );
    const [overdue] = await selectRows<{ count: string }>(
      this.dataSource.manager,
      `SELECT count(*) FROM interactions.comment
       WHERE status = 'pending' AND branch_id = ANY($1::uuid[]) AND submitted_at <= $2`,
      [branchIds, threshold],
    );
    const names = await this.diners.publicNames(
      rows.map((row) => row.diner_id),
    );
    const page = toPage(
      rows.map((row) => ({ ...row, createdAt: row.submitted_at })),
      query.limit,
      (row) => ({
        id: row.id,
        branchId: row.branch_id,
        dishId: row.dish_id,
        text: row.text,
        author: { name: names.get(row.diner_id) ?? '' },
        version: row.version,
        submittedAt: row.submitted_at.toISOString(),
        overdue: row.submitted_at.getTime() <= threshold.getTime(),
      }),
    );
    return { ...page, overdueCount: Number(overdue.count) };
  }
}
