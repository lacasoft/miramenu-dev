import { createHash } from 'node:crypto';
import { CATALOG_ERROR_CODES, type Publication } from '@miramenu/contracts';
import type { EntityManager } from 'typeorm';
import { selectRows } from '../../../infrastructure/database/query';
import { ApiException } from '../../../infrastructure/http/api-exception';
import type {
  BaseSnapshot,
  BranchSnapshot,
  MenuContent,
} from '../domain/menu-snapshot';

/** Writes of fixed published versions, and the idempotency record of each publication. */

export type PublicationScope = Publication['scope'];

export interface PublicationRequest {
  scope: PublicationScope;
  scopeId: string;
  idempotencyKey: string;
  /** Identifies the request body, so a key reused for another request is refused. */
  fingerprint: string;
}

export function fingerprintOf(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(body)).digest('base64url');
}

/**
 * The publication already made with this key, or null (design: flujo publicar, paso 2).
 * Callers hold the publication's lock first, so a concurrent retry with the same key waits
 * for the first one and then finds it here.
 */
export async function previousPublication(
  manager: EntityManager,
  request: PublicationRequest,
): Promise<Publication | null> {
  const [row] = await selectRows<{
    request_fingerprint: string;
    result: Publication;
  }>(
    manager,
    `SELECT request_fingerprint, result FROM catalog.publication
     WHERE scope = $1 AND scope_id = $2 AND idempotency_key = $3`,
    [request.scope, request.scopeId, request.idempotencyKey],
  );
  if (!row) return null;
  if (row.request_fingerprint !== request.fingerprint) {
    throw new ApiException(
      422,
      CATALOG_ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
      'This idempotency key was used for a different publication',
    );
  }
  return row.result;
}

export async function insertPublication(
  manager: EntityManager,
  request: PublicationRequest,
  publishedBy: string,
  result: Publication,
): Promise<void> {
  await manager.query(
    `INSERT INTO catalog.publication
       (id, scope, scope_id, idempotency_key, request_fingerprint, result, published_by, created_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
    [
      result.id,
      request.scope,
      request.scopeId,
      request.idempotencyKey,
      request.fingerprint,
      JSON.stringify(result),
      publishedBy,
      result.publishedAt,
    ],
  );
}

export async function insertPublishedBase(
  manager: EntityManager,
  record: {
    businessId: string;
    version: number;
    content: BaseSnapshot;
    publicationId: string;
    publishedAt: string;
  },
): Promise<void> {
  await manager.query(
    `INSERT INTO catalog.published_base (business_id, version, content, publication_id, published_at)
     VALUES ($1, $2, $3::jsonb, $4, $5)`,
    [
      record.businessId,
      record.version,
      JSON.stringify(record.content),
      record.publicationId,
      record.publishedAt,
    ],
  );
  await manager.query(
    `UPDATE catalog.business_state SET published_version = $2 WHERE business_id = $1`,
    [record.businessId, record.version],
  );
}

export async function insertPublishedBranch(
  manager: EntityManager,
  record: {
    branchId: string;
    businessId: string;
    version: number;
    content: BranchSnapshot;
    publicationId: string;
    publishedAt: string;
  },
): Promise<void> {
  await manager.query(
    `INSERT INTO catalog.published_branch (branch_id, business_id, version, content, publication_id, published_at)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
    [
      record.branchId,
      record.businessId,
      record.version,
      JSON.stringify(record.content),
      record.publicationId,
      record.publishedAt,
    ],
  );
  await manager.query(
    `UPDATE catalog.branch_state SET published_version = $2 WHERE branch_id = $1`,
    [record.branchId, record.version],
  );
}

/** Why a menu version exists: a person published, or a medium it waited for became ready. */
export type MenuSource =
  | { origin: 'publication'; publicationId: string }
  | { origin: 'media_ready'; mediaId: string };

export async function insertPublishedMenu(
  manager: EntityManager,
  record: {
    branchId: string;
    businessId: string;
    version: number;
    baseVersion: number;
    branchVersion: number | null;
    content: MenuContent;
    pendingMedia: readonly string[];
    source: MenuSource;
    publishedAt: string;
  },
): Promise<void> {
  const { source } = record;
  await manager.query(
    `INSERT INTO catalog.published_menu
       (branch_id, business_id, version, base_version, branch_version, origin, content,
        pending_media, publication_id, media_id, published_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::uuid[], $9, $10, $11)`,
    [
      record.branchId,
      record.businessId,
      record.version,
      record.baseVersion,
      record.branchVersion,
      source.origin,
      JSON.stringify(record.content),
      record.pendingMedia,
      source.origin === 'publication' ? source.publicationId : null,
      source.origin === 'media_ready' ? source.mediaId : null,
      record.publishedAt,
    ],
  );
  await manager.query(
    `UPDATE catalog.branch_state SET menu_version = $2 WHERE branch_id = $1`,
    [record.branchId, record.version],
  );
}
