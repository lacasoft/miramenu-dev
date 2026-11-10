import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  CATALOG_ERROR_CODES,
  type CreatedMedia,
  type CreateMediaRequest,
  GENERIC_ERROR_CODES,
  type Media,
  type MediaFailureReason,
  type MediaKind,
  type MediaStatus,
  type Page,
} from '@miramenu/contracts';
import type { DataSource, EntityManager } from 'typeorm';
import { APP_CONFIG } from '../../../infrastructure/config/config.module';
import type { AppConfig } from '../../../infrastructure/config/environment';
import {
  returningRows,
  selectRows,
} from '../../../infrastructure/database/query';
import { ApiException } from '../../../infrastructure/http/api-exception';
import {
  decodeCursor,
  toPage,
} from '../../../infrastructure/http/keyset-cursor';
import { ObjectStorage } from '../../../infrastructure/storage/object-storage';
import { AccessControl, type Actor } from '../../business-access';
import {
  isStalled,
  type MediaVariants,
  resolveVariants,
} from '../domain/media-rules';
import { DraftState } from './draft-state';
import { conflict, mediaRejected, notFound } from './errors';
import { originalKey } from './media-keys';
import { MediaQueue } from './media-queue';
import type { MediaScope } from './media-refs';

/** Who uploads: the business (its admin) or one of its branches (its branch admin). */
export type MediaTarget = { businessId: string } | { branchId: string };

export interface MediaListQuery {
  limit: number;
  cursor?: string;
  problem?: boolean;
}

interface MediaRow {
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

const MEDIA_COLUMNS = `id, business_id, branch_id, kind, status, content_type, size_bytes,
  failure_reason, variants, processing_since, created_at`;

/**
 * Media of a business (ADR-0006, ADR-0038). The API never receives the bytes: it creates
 * the Medio and signs a short PUT straight to storage, with its type and size fixed; the
 * admin then confirms, the API checks what arrived, and the worker optimizes it.
 */
@Injectable()
export class MediaService {
  constructor(
    @InjectDataSource('catalog') private readonly dataSource: DataSource,
    private readonly access: AccessControl,
    private readonly state: DraftState,
    private readonly storage: ObjectStorage,
    private readonly queue: MediaQueue,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async create(
    actor: Actor,
    target: MediaTarget,
    input: CreateMediaRequest,
  ): Promise<CreatedMedia> {
    const scope = await this.scopeOf(actor, target);
    return this.dataSource.transaction(async (manager) => {
      await this.ensureState(manager, scope);
      const [row] = await selectRows<MediaRow>(
        manager,
        `INSERT INTO catalog.media_asset (business_id, branch_id, kind, status, content_type, size_bytes)
         VALUES ($1, $2, $3, 'pending_upload', $4, $5)
         RETURNING ${MEDIA_COLUMNS}`,
        [
          scope.businessId,
          scope.branchId,
          input.kind,
          input.contentType,
          input.sizeBytes,
        ],
      );
      const upload = await this.storage.presignPut(
        'originals',
        originalKey(row.business_id, row.id),
        {
          contentType: input.contentType,
          sizeBytes: input.sizeBytes,
          expiresInSeconds: this.config.media.uploadUrlTtlSeconds,
        },
      );
      return {
        media: this.toMedia(row),
        upload: {
          url: upload.url,
          method: 'PUT',
          headers: upload.headers,
          expiresAt: upload.expiresAt.toISOString(),
        },
      };
    });
  }

  /**
   * Confirms the upload. What arrived must be exactly what was signed; if not, the medium
   * fails and its original is deleted. Confirming again is safe: a medium still processing
   * is queued again, which also recovers one whose queueing failed.
   */
  async complete(
    actor: Actor,
    target: MediaTarget,
    mediaId: string,
  ): Promise<Media> {
    const scope = await this.scopeOf(actor, target);
    const outcome = await this.dataSource.transaction((manager) =>
      this.confirm(manager, scope, mediaId),
    );
    if (outcome.rejected) {
      await this.storage.delete(
        'originals',
        originalKey(outcome.row.business_id, outcome.row.id),
      );
      throw mediaRejected();
    }
    if (outcome.row.status === 'processing') {
      try {
        await this.queue.enqueue(outcome.row.id);
      } catch {
        throw new ApiException(
          503,
          GENERIC_ERROR_CODES.SERVICE_UNAVAILABLE,
          'The media queue is unavailable; confirm the upload again later',
        );
      }
    }
    return this.toMedia(outcome.row);
  }

  /**
   * The business admin sees every medium of the business; a branch sees its business's and
   * its own. problem: only the failed and the stalled ones (design: avisar al admin).
   */
  async list(
    actor: Actor,
    target: MediaTarget,
    query: MediaListQuery,
  ): Promise<Page<Media>> {
    const scope = await this.scopeOf(actor, target);
    const after = query.cursor ? decodeCursor(query.cursor) : null;
    const rows = await selectRows<MediaRow>(
      this.dataSource.manager,
      `SELECT ${MEDIA_COLUMNS} FROM catalog.media_asset
       WHERE business_id = $1
         AND ($2::uuid IS NULL OR branch_id IS NULL OR branch_id = $2)
         AND (NOT $3::boolean OR status = 'failed'
              OR (status = 'processing' AND processing_since <= now() - make_interval(mins => $4)))
         AND ($5::timestamptz IS NULL OR (created_at, id) < ($5::timestamptz, $6::uuid))
       ORDER BY created_at DESC, id DESC
       LIMIT $7`,
      [
        scope.businessId,
        scope.branchId,
        query.problem ?? false,
        this.config.media.stalledMinutes,
        after?.createdAt ?? null,
        after?.id ?? null,
        query.limit + 1,
      ],
    );
    return toPage(
      rows.map((row) => ({ ...row, createdAt: row.created_at })),
      query.limit,
      (row) => this.toMedia(row),
    );
  }

  private async confirm(
    manager: EntityManager,
    scope: MediaScope,
    mediaId: string,
  ): Promise<{ row: MediaRow; rejected: boolean }> {
    const [row] = await selectRows<MediaRow>(
      manager,
      `SELECT ${MEDIA_COLUMNS} FROM catalog.media_asset
       WHERE id = $1 AND business_id = $2 AND branch_id IS NOT DISTINCT FROM $3
       FOR UPDATE`,
      [mediaId, scope.businessId, scope.branchId],
    );
    if (!row) throw notFound();
    if (row.status === 'failed') {
      throw conflict(
        CATALOG_ERROR_CODES.MEDIA_FAILED,
        'The medium failed; upload it again',
      );
    }
    if (row.status !== 'pending_upload') return { row, rejected: false };

    const stored = await this.storage.head(
      'originals',
      originalKey(row.business_id, row.id),
    );
    if (!stored) {
      throw conflict(
        CATALOG_ERROR_CODES.MEDIA_NOT_UPLOADED,
        'The file has not been uploaded yet',
      );
    }
    const matches =
      stored.size === row.size_bytes && stored.contentType === row.content_type;
    const [updated] = await returningRows<MediaRow>(
      manager,
      matches
        ? `UPDATE catalog.media_asset
           SET status = 'processing', processing_since = now(), updated_at = now()
           WHERE id = $1 RETURNING ${MEDIA_COLUMNS}`
        : `UPDATE catalog.media_asset
           SET status = 'failed', failure_reason = 'upload_mismatch', updated_at = now()
           WHERE id = $1 RETURNING ${MEDIA_COLUMNS}`,
      [row.id],
    );
    return { row: updated, rejected: !matches };
  }

  /** The business route needs 'administer'; a branch route, 'operate' on that branch. */
  private async scopeOf(
    actor: Actor,
    target: MediaTarget,
  ): Promise<MediaScope> {
    if ('businessId' in target) {
      this.access.assertBusiness(actor, target.businessId, 'administer');
      return { businessId: target.businessId, branchId: null };
    }
    const branch = await this.access.assertBranch(
      actor,
      target.branchId,
      'operate',
    );
    return { businessId: branch.businessId, branchId: branch.id };
  }

  private ensureState(manager: EntityManager, scope: MediaScope) {
    return scope.branchId === null
      ? this.state.ensureBusiness(manager, scope.businessId)
      : this.state.ensureBranch(manager, {
          id: scope.branchId,
          businessId: scope.businessId,
        });
  }

  private toMedia(row: MediaRow): Media {
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
}
