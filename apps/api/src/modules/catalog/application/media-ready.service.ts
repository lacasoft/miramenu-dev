import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { MediaFailureReason, MediaKind } from '@miramenu/contracts';
import type { DataSource, EntityManager } from 'typeorm';
import {
  returningRows,
  selectRows,
} from '../../../infrastructure/database/query';
import { ObjectStorage } from '../../../infrastructure/storage/object-storage';
import type { MediaVariants } from '../domain/media-rules';
import type { BaseSnapshot, BranchSnapshot } from '../domain/menu-snapshot';
import { originalKey } from './media-keys';
import type { Published } from './menu-store';
import { recordMenuVersion } from './menu-versions';
import { PublishedMenuService } from './published-menu.service';

export interface ProcessingMedia {
  id: string;
  businessId: string;
  kind: MediaKind;
  originalKey: string;
}

interface BranchMenuRow {
  branch_id: string;
  menu_version: number | null;
  base_version: number | null;
  branch_version: number | null;
  waits: boolean | null;
}

/**
 * What the media worker tells Catalog (ADR-0006, ADR-0015): a medium is ready or failed.
 * A ready medium yields a new version of every branch menu that waits for it, combined
 * again from the same published snapshots, never from a draft. Retrying is safe: the
 * medium is no longer processing, so nothing happens, and Postgres refuses a second
 * version for the same medium.
 */
@Injectable()
export class MediaReadyService {
  constructor(
    @InjectDataSource('catalog') private readonly dataSource: DataSource,
    private readonly storage: ObjectStorage,
    private readonly menus: PublishedMenuService,
  ) {}

  /** The medium if it still waits for the worker; null if it is ready, failed or gone. */
  async processing(mediaId: string): Promise<ProcessingMedia | null> {
    const [row] = await selectRows<{
      id: string;
      business_id: string;
      kind: MediaKind;
    }>(
      this.dataSource.manager,
      `SELECT id, business_id, kind FROM catalog.media_asset
       WHERE id = $1 AND status = 'processing'`,
      [mediaId],
    );
    return row
      ? {
          id: row.id,
          businessId: row.business_id,
          kind: row.kind,
          originalKey: originalKey(row.business_id, row.id),
        }
      : null;
  }

  async markReady(mediaId: string, variants: MediaVariants): Promise<void> {
    const affected = await this.dataSource.transaction((manager) =>
      this.readyIn(manager, mediaId, variants),
    );
    if (affected.length > 0) await this.menus.invalidate(affected);
  }

  /** The dish keeps its photo, if it has one; the admin sees the failure (design: Cae el worker). */
  async markFailed(mediaId: string, reason: MediaFailureReason): Promise<void> {
    await this.dataSource.manager.query(
      `UPDATE catalog.media_asset
       SET status = 'failed', failure_reason = $2, updated_at = now()
       WHERE id = $1 AND status IN ('pending_upload', 'processing')`,
      [mediaId, reason],
    );
  }

  /**
   * Same locks, in the same order, as a publication: the business row, then its branches.
   * So a publication either finishes first (and this sees the medium pending in its new
   * version) or starts after (and already sees the medium ready).
   */
  private async readyIn(
    manager: EntityManager,
    mediaId: string,
    variants: MediaVariants,
  ): Promise<string[]> {
    const [media] = await selectRows<{ business_id: string }>(
      manager,
      `SELECT business_id FROM catalog.media_asset WHERE id = $1`,
      [mediaId],
    );
    if (!media) return [];
    const businessId = media.business_id;
    await manager.query(
      `SELECT 1 FROM catalog.business_state WHERE business_id = $1 FOR KEY SHARE`,
      [businessId],
    );
    const branches = await selectRows<BranchMenuRow>(
      manager,
      `SELECT bs.branch_id, bs.menu_version, pm.base_version, pm.branch_version,
         $2::uuid = ANY(pm.pending_media) AS waits
       FROM catalog.branch_state bs
       LEFT JOIN catalog.published_menu pm
         ON pm.branch_id = bs.branch_id AND pm.version = bs.menu_version
       WHERE bs.business_id = $1
       ORDER BY bs.branch_id
       FOR UPDATE OF bs`,
      [businessId, mediaId],
    );
    const [updated] = await returningRows(
      manager,
      `UPDATE catalog.media_asset
       SET status = 'ready', variants = $2::jsonb, updated_at = now()
       WHERE id = $1 AND status = 'processing'
       RETURNING id`,
      [mediaId, JSON.stringify(variants)],
    );
    if (!updated) return [];

    const publishedAt = new Date().toISOString();
    const affected: string[] = [];
    for (const branch of branches) {
      if (!branch.waits || branch.menu_version === null) continue;
      await recordMenuVersion(manager, (key) => this.storage.publicUrl(key), {
        branchId: branch.branch_id,
        businessId,
        version: branch.menu_version + 1,
        base: await this.publishedBase(manager, businessId, branch),
        branch: await this.publishedBranch(manager, branch),
        source: { origin: 'media_ready', mediaId },
        publishedAt,
      });
      affected.push(branch.branch_id);
    }
    return affected;
  }

  private async publishedBase(
    manager: EntityManager,
    businessId: string,
    branch: BranchMenuRow,
  ): Promise<Published<BaseSnapshot>> {
    const [row] = await selectRows<Published<BaseSnapshot>>(
      manager,
      `SELECT version, content FROM catalog.published_base
       WHERE business_id = $1 AND version = $2`,
      [businessId, branch.base_version],
    );
    return row;
  }

  private async publishedBranch(
    manager: EntityManager,
    branch: BranchMenuRow,
  ): Promise<Published<BranchSnapshot> | null> {
    if (branch.branch_version === null) return null;
    const [row] = await selectRows<Published<BranchSnapshot>>(
      manager,
      `SELECT version, content FROM catalog.published_branch
       WHERE branch_id = $1 AND version = $2`,
      [branch.branch_id, branch.branch_version],
    );
    return row ?? null;
  }
}
