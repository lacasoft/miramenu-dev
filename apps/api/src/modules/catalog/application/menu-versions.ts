import type { EntityManager } from 'typeorm';
import { selectRows } from '../../../infrastructure/database/query';
import { composeMenu, referencedMedia } from '../domain/compose-menu';
import { type MediaVariants, resolveVariants } from '../domain/media-rules';
import {
  type BaseSnapshot,
  type BranchSnapshot,
  EMPTY_BRANCH_SNAPSHOT,
  type MediaState,
} from '../domain/menu-snapshot';
import type { Published } from './menu-store';
import { insertPublishedMenu, type MenuSource } from './publication-records';

type PublicUrl = (key: string) => string;

/** What combining needs to know of each medium: ready (with its URLs), pending or failed. */
export async function loadMediaStates(
  manager: EntityManager,
  mediaIds: readonly string[],
  publicUrl: PublicUrl,
): Promise<Map<string, MediaState>> {
  if (mediaIds.length === 0) return new Map();
  const rows = await selectRows<{
    id: string;
    status: string;
    variants: MediaVariants | null;
  }>(
    manager,
    `SELECT id, status, variants FROM catalog.media_asset WHERE id = ANY($1::uuid[])`,
    [mediaIds],
  );
  return new Map(
    rows.map((row): [string, MediaState] => {
      if (row.status === 'ready' && row.variants) {
        const resolved = resolveVariants(row.variants, publicUrl);
        return [
          row.id,
          resolved.image
            ? { status: 'ready', kind: 'image', image: resolved.image }
            : { status: 'ready', kind: 'video', video: resolved.video },
        ];
      }
      return [
        row.id,
        { status: row.status === 'failed' ? 'failed' : 'pending' },
      ];
    }),
  );
}

/**
 * Writes a new version of a branch's menu, combined from published snapshots only (never a
 * draft) and with the media as they are right now (ADR-0003, ADR-0015).
 */
export async function recordMenuVersion(
  manager: EntityManager,
  publicUrl: PublicUrl,
  record: {
    branchId: string;
    businessId: string;
    version: number;
    base: Published<BaseSnapshot>;
    branch: Published<BranchSnapshot> | null;
    source: MenuSource;
    publishedAt: string;
  },
): Promise<void> {
  const snapshot = record.branch?.content ?? EMPTY_BRANCH_SNAPSHOT;
  const states = await loadMediaStates(
    manager,
    referencedMedia(record.base.content, snapshot),
    publicUrl,
  );
  const composed = composeMenu(record.base.content, snapshot, states);
  await insertPublishedMenu(manager, {
    branchId: record.branchId,
    businessId: record.businessId,
    version: record.version,
    baseVersion: record.base.version,
    branchVersion: record.branch?.version ?? null,
    content: composed.content,
    pendingMedia: composed.pendingMedia,
    source: record.source,
    publishedAt: record.publishedAt,
  });
}
