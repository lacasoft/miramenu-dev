import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { BranchInteractions } from '@miramenu/contracts';
import type { DataSource } from 'typeorm';
import { selectRows } from '../../../infrastructure/database/query';

/** Likes and approved comments of one dish on one local day of a period. */
export interface PeriodCount {
  dishId: string;
  /** YYYY-MM-DD in the time zone asked for. */
  day: string;
  likes: number;
  comments: number;
}

/**
 * Contract "Conteos por platillo y sucursal" (design): likes and approved comments of
 * each dish of a branch. Pending, rejected and deleted comments never count (ADR-0008).
 */
@Injectable()
export class InteractionCounts {
  constructor(
    @InjectDataSource('interactions') private readonly dataSource: DataSource,
  ) {}

  async forBranch(branchId: string): Promise<BranchInteractions> {
    const rows = await selectRows<{
      dish_id: string;
      likes: string;
      comments: string;
    }>(
      this.dataSource.manager,
      `SELECT dish_id, sum(likes) AS likes, sum(comments) AS comments FROM (
         SELECT dish_id, count(*) AS likes, 0 AS comments FROM interactions.dish_like
         WHERE branch_id = $1 GROUP BY dish_id
         UNION ALL
         SELECT dish_id, 0, count(*) FROM interactions.comment
         WHERE branch_id = $1 AND status = 'approved' GROUP BY dish_id
       ) counts GROUP BY dish_id ORDER BY dish_id`,
      [branchId],
    );
    return {
      dishes: rows.map((row) => ({
        dishId: row.dish_id,
        likes: Number(row.likes),
        comments: Number(row.comments),
      })),
    };
  }

  /**
   * For the dashboard (Measurement): likes given and comments approved within the period,
   * by dish and local day. A like taken back is gone, so it no longer counts.
   */
  async forPeriod(
    branchIds: readonly string[],
    from: Date,
    to: Date,
    timeZone: string,
  ): Promise<PeriodCount[]> {
    if (branchIds.length === 0) return [];
    const rows = await selectRows<{
      dish_id: string;
      day: string;
      likes: string;
      comments: string;
    }>(
      this.dataSource.manager,
      `SELECT dish_id, day, sum(likes) AS likes, sum(comments) AS comments FROM (
         SELECT dish_id, to_char(created_at AT TIME ZONE $4, 'YYYY-MM-DD') AS day,
           count(*) AS likes, 0 AS comments
         FROM interactions.dish_like
         WHERE branch_id = ANY($1::uuid[]) AND created_at >= $2 AND created_at < $3
         GROUP BY 1, 2
         UNION ALL
         SELECT dish_id, to_char(approved_at AT TIME ZONE $4, 'YYYY-MM-DD'), 0, count(*)
         FROM interactions.comment
         WHERE branch_id = ANY($1::uuid[]) AND status = 'approved'
           AND approved_at >= $2 AND approved_at < $3
         GROUP BY 1, 2
       ) counts GROUP BY dish_id, day ORDER BY day, dish_id`,
      [branchIds, from, to, timeZone],
    );
    return rows.map((row) => ({
      dishId: row.dish_id,
      day: row.day,
      likes: Number(row.likes),
      comments: Number(row.comments),
    }));
  }
}
