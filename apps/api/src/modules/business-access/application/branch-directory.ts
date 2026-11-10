import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { selectRows } from '../../../infrastructure/database/query';

/**
 * Contract for the contexts that build something per branch (Catalog publishes one menu per
 * branch): they cannot read this schema (ADR-0027), so they ask here. It never checks
 * permissions; callers run AccessControl first.
 */
@Injectable()
export class BranchDirectory {
  constructor(
    @InjectDataSource('business_access')
    private readonly dataSource: DataSource,
  ) {}

  /** The ids of every branch of the business, or null when the business does not exist. */
  async branchIdsOf(businessId: string): Promise<string[] | null> {
    const rows = await selectRows<{ branch_id: string | null }>(
      this.dataSource.manager,
      `SELECT br.id AS branch_id
       FROM business_access.business b
       LEFT JOIN business_access.branch br ON br.business_id = b.id
       WHERE b.id = $1
       ORDER BY br.id`,
      [businessId],
    );
    if (rows.length === 0) return null;
    return rows.flatMap((row) => (row.branch_id ? [row.branch_id] : []));
  }
}
