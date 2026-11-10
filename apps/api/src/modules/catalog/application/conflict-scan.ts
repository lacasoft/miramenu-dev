import type { PublicationConflict } from '@miramenu/contracts';
import type { EntityManager } from 'typeorm';
import { findConflicts } from '../domain/conflicts';
import type {
  BaseSnapshot,
  BranchSnapshot,
  SnapshotOverride,
} from '../domain/menu-snapshot';
import {
  type DraftBaseDishRow,
  latestPublishedBase,
  latestPublishedBranches,
  overridesOfBusiness,
  type Published,
} from './menu-store';

export interface ConflictScan {
  conflicts: PublicationConflict[];
  publishedBase: Published<BaseSnapshot> | null;
  draftOverrides: Map<string, SnapshotOverride[]>;
  publishedBranches: Map<string, Published<BranchSnapshot>>;
}

/** The conflicts of the base draft with every branch, and what they were computed from. */
export async function scanConflicts(
  manager: EntityManager,
  businessId: string,
  draftDishes: readonly DraftBaseDishRow[],
): Promise<ConflictScan> {
  const publishedBase = await latestPublishedBase(manager, businessId);
  const draftOverrides = await overridesOfBusiness(manager, businessId);
  const publishedBranches = await latestPublishedBranches(manager, businessId);
  const branchIds = new Set([
    ...draftOverrides.keys(),
    ...publishedBranches.keys(),
  ]);
  const conflicts = findConflicts({
    draftDishes,
    publishedBase: publishedBase?.content ?? null,
    branches: [...branchIds].map((branchId) => ({
      branchId,
      draft: draftOverrides.get(branchId) ?? [],
      published: publishedBranches.get(branchId)?.content.overrides ?? [],
    })),
  });
  return { conflicts, publishedBase, draftOverrides, publishedBranches };
}
