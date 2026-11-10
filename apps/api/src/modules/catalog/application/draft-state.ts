import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { changeRows, selectRows } from '../../../infrastructure/database/query';
import { BranchDirectory, type BranchRef } from '../../business-access';
import { notFound } from './errors';

/**
 * The state rows of a business and its branches: the draft version every edit bumps and
 * every publication checks (design: flujo publicar, paso 3). Edits bump it first, so an
 * edit waits for a publication in progress and a publication waits for an edit in progress.
 */
@Injectable()
export class DraftState {
  constructor(private readonly directory: BranchDirectory) {}

  /** 404 when the business does not exist. */
  async assertBusinessExists(businessId: string): Promise<void> {
    if ((await this.directory.branchIdsOf(businessId)) === null) {
      throw notFound();
    }
  }

  /** Creates the business's state the first time; 404 when the business does not exist. */
  async ensureBusiness(
    manager: EntityManager,
    businessId: string,
  ): Promise<void> {
    const [existing] = await selectRows(
      manager,
      `SELECT 1 FROM catalog.business_state WHERE business_id = $1`,
      [businessId],
    );
    if (existing) return;
    // Only the superadmin can name a business that does not exist: its check lets every id through.
    await this.assertBusinessExists(businessId);
    await manager.query(
      `INSERT INTO catalog.business_state (business_id) VALUES ($1) ON CONFLICT DO NOTHING`,
      [businessId],
    );
  }

  /** The branch comes from AccessControl.assertBranch, so it and its business exist. */
  async ensureBranch(manager: EntityManager, branch: BranchRef): Promise<void> {
    await manager.query(
      `INSERT INTO catalog.business_state (business_id) VALUES ($1) ON CONFLICT DO NOTHING`,
      [branch.businessId],
    );
    await manager.query(
      `INSERT INTO catalog.branch_state (branch_id, business_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [branch.id, branch.businessId],
    );
  }

  async bumpBusinessDraft(
    manager: EntityManager,
    businessId: string,
  ): Promise<void> {
    const bump = () =>
      changeRows(
        manager,
        `UPDATE catalog.business_state SET draft_version = draft_version + 1 WHERE business_id = $1`,
        [businessId],
      );
    if ((await bump()) > 0) return;
    await this.ensureBusiness(manager, businessId);
    await bump();
  }

  async bumpBranchDraft(
    manager: EntityManager,
    branch: BranchRef,
  ): Promise<void> {
    const bump = () =>
      changeRows(
        manager,
        `UPDATE catalog.branch_state SET draft_version = draft_version + 1 WHERE branch_id = $1`,
        [branch.id],
      );
    if ((await bump()) > 0) return;
    await this.ensureBranch(manager, branch);
    await bump();
  }
}
