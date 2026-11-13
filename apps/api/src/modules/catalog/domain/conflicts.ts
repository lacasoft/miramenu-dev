import type { ConflictRef, PublicationConflict } from '@miramenu/contracts';
import type { BaseSnapshot, SnapshotOverride } from './menu-snapshot';

/** A base dish as it stands in the business's draft. */
export interface DraftBaseDish {
  id: string;
  name: string;
  priceCents: number;
  removed: boolean;
}

/** A branch's adjustments, both still in its draft and already published. */
export interface BranchAdjustments {
  branchId: string;
  draft: readonly SnapshotOverride[];
  published: readonly SnapshotOverride[];
}

export interface ConflictInput {
  draftDishes: readonly DraftBaseDish[];
  /** The last published base menu; null before the first publication. */
  publishedBase: BaseSnapshot | null;
  branches: readonly BranchAdjustments[];
}

const keyOf = (ref: ConflictRef) => `${ref.branchId}:${ref.dishId}`;

/**
 * What publishing the base draft would overwrite (ADR-0036, design: "aviso de diferencias"):
 * a dish the branch adjusted was removed, or the base price of a dish the branch re-priced
 * changed since the last publication. A branch price equal to the new base price does not
 * clash. Sorted by branch and dish, so the admin always sees the same list.
 */
export function findConflicts(input: ConflictInput): PublicationConflict[] {
  const draftById = new Map(input.draftDishes.map((dish) => [dish.id, dish]));
  const publishedPrice = new Map(
    (input.publishedBase?.dishes ?? []).map((dish) => [
      dish.id,
      dish.priceCents,
    ]),
  );

  const conflicts: PublicationConflict[] = [];
  for (const branch of input.branches) {
    const adjusted = new Map<string, SnapshotOverride[]>();
    for (const override of [...branch.draft, ...branch.published]) {
      adjusted.set(override.dishId, [
        ...(adjusted.get(override.dishId) ?? []),
        override,
      ]);
    }
    for (const [dishId, overrides] of adjusted) {
      const dish = draftById.get(dishId);
      if (!dish) continue;
      if (dish.removed) {
        conflicts.push({
          branchId: branch.branchId,
          dishId,
          reason: 'dish_removed',
          dishName: dish.name,
        });
        continue;
      }
      const before = publishedPrice.get(dishId);
      const priceChanged = before !== undefined && before !== dish.priceCents;
      const clashes = overrides.some(
        (override) =>
          override.priceCents !== null &&
          override.priceCents !== dish.priceCents,
      );
      if (priceChanged && clashes) {
        conflicts.push({
          branchId: branch.branchId,
          dishId,
          reason: 'price_changed',
          dishName: dish.name,
        });
      }
    }
  }
  return conflicts.sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : 1));
}

/** Current conflicts the admin did not confirm; publishing waits until there are none. */
export function unconfirmedConflicts(
  conflicts: readonly PublicationConflict[],
  confirmed: readonly ConflictRef[],
): PublicationConflict[] {
  const seen = new Set(confirmed.map(keyOf));
  return conflicts.filter((conflict) => !seen.has(keyOf(conflict)));
}

/**
 * A branch's adjustments once the business overwrites its confirmed conflicts: an
 * adjustment of a removed dish goes away, and a clashing branch price goes back to the
 * base price, keeping the branch's availability and hidden flags.
 */
export function overwriteAdjustments(
  overrides: readonly SnapshotOverride[],
  conflicts: readonly Pick<PublicationConflict, 'dishId' | 'reason'>[],
): SnapshotOverride[] {
  const reasonOf = new Map(
    conflicts.map((conflict) => [conflict.dishId, conflict.reason]),
  );
  return overrides.flatMap((override) => {
    const reason = reasonOf.get(override.dishId);
    if (reason === 'dish_removed') return [];
    if (reason === 'price_changed') return [{ ...override, priceCents: null }];
    return [override];
  });
}
