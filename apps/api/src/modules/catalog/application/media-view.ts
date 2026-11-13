import { Inject, Injectable } from '@nestjs/common';
import type {
  Media,
  MediaFailureReason,
  MediaKind,
  MediaStatus,
} from '@miramenu/contracts';
import type { EntityManager } from 'typeorm';
import { APP_CONFIG } from '../../../infrastructure/config/config.module';
import type { AppConfig } from '../../../infrastructure/config/environment';
import { selectRows } from '../../../infrastructure/database/query';
import { ObjectStorage } from '../../../infrastructure/storage/object-storage';
import {
  isStalled,
  type MediaVariants,
  resolveVariants,
} from '../domain/media-rules';

export interface MediaRow {
  id: string;
  business_id: string;
  branch_id: string | null;
  kind: MediaKind;
  status: MediaStatus;
  content_type: string;
  size_bytes: number;
  failure_reason: MediaFailureReason | null;
  variants: MediaVariants | null;
  processing_since: Date | null;
  created_at: Date;
}

export const MEDIA_COLUMNS = `id, business_id, branch_id, kind, status, content_type, size_bytes,
  failure_reason, variants, processing_since, created_at`;

/**
 * A medium as the admin sees it: its state, whether it is stalled, and its public
 * variants once ready (ADR-0038).
 */
@Injectable()
export class MediaView {
  constructor(
    private readonly storage: ObjectStorage,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  of(row: MediaRow): Media {
    const resolved = row.variants
      ? resolveVariants(row.variants, (key) => this.storage.publicUrl(key))
      : { image: null, video: null };
    return {
      id: row.id,
      kind: row.kind,
      branchId: row.branch_id,
      status: row.status,
      contentType: row.content_type,
      sizeBytes: row.size_bytes,
      failureReason: row.failure_reason,
      stalled: isStalled(
        row.status,
        row.processing_since,
        new Date(),
        this.config.media.stalledMinutes,
      ),
      image: resolved.image,
      video: resolved.video,
      createdAt: row.created_at.toISOString(),
    };
  }

  /** The business's media among these ids, in the transaction of the draft that names them. */
  async among(
    manager: EntityManager,
    businessId: string,
    ids: ReadonlySet<string>,
  ): Promise<Media[]> {
    if (ids.size === 0) return [];
    const rows = await selectRows<MediaRow>(
      manager,
      `SELECT ${MEDIA_COLUMNS} FROM catalog.media_asset
       WHERE business_id = $1 AND id = ANY($2::uuid[])
       ORDER BY id`,
      [businessId, [...ids]],
    );
    return rows.map((row) => this.of(row));
  }
}
