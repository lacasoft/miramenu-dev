import { CATALOG_ERROR_CODES, type MediaKind } from '@miramenu/contracts';
import type { EntityManager } from 'typeorm';
import { selectRows } from '../../../infrastructure/database/query';
import { conflict, mediaKindMismatch, mediaNotFound } from './errors';

/**
 * Whose media a draft may use: the business's own (branchId null), or, for a branch, its
 * business's and its own, never a sibling branch's (ADR-0019, ADR-0038).
 */
export interface MediaScope {
  businessId: string;
  branchId: string | null;
}

/**
 * A medium id from the body must be of this business and scope, of the kind its slot
 * expects, and uploaded. FOR KEY SHARE keeps it from changing state under the edit.
 */
export async function assertMediaRef(
  manager: EntityManager,
  scope: MediaScope,
  mediaId: string,
  kind: MediaKind,
): Promise<void> {
  const [row] = await selectRows<{ kind: MediaKind; status: string }>(
    manager,
    `SELECT kind, status FROM catalog.media_asset
     WHERE id = $1 AND business_id = $2 AND (branch_id IS NULL OR branch_id = $3)
     FOR KEY SHARE`,
    [mediaId, scope.businessId, scope.branchId],
  );
  if (!row) throw mediaNotFound();
  if (row.kind !== kind) throw mediaKindMismatch();
  if (row.status === 'pending_upload') {
    throw conflict(
      CATALOG_ERROR_CODES.MEDIA_NOT_UPLOADED,
      'Confirm the upload of the medium before using it',
    );
  }
  if (row.status === 'failed') {
    throw conflict(
      CATALOG_ERROR_CODES.MEDIA_FAILED,
      'The medium failed to process; upload it again',
    );
  }
}

/** Checks every medium a dish or profile change names; undefined and null need no check. */
export async function assertMediaRefs(
  manager: EntityManager,
  scope: MediaScope,
  refs: { imageId?: string | null; videoId?: string | null },
): Promise<void> {
  if (refs.imageId) await assertMediaRef(manager, scope, refs.imageId, 'image');
  if (refs.videoId) await assertMediaRef(manager, scope, refs.videoId, 'video');
}
