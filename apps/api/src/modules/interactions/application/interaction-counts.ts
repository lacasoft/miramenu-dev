import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { BranchInteractions } from '@miramenu/contracts';
import type { DataSource } from 'typeorm';
import { selectRows } from '../../../infrastructure/database/query';

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
}
