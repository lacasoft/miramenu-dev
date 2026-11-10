import type { MenuCategory, MenuDish } from '@miramenu/contracts';
import type {
  BaseSnapshot,
  BranchSnapshot,
  MenuContent,
  SnapshotDish,
} from './menu-snapshot';

interface Placed {
  categoryId: string;
  position: number;
  dish: MenuDish;
}

/** Deterministic order, independent of the server's locale: position, then name, then id. */
function byPlacement(
  a: { position: number; name: string; id: string },
  b: { position: number; name: string; id: string },
): number {
  if (a.position !== b.position) return a.position - b.position;
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

function menuDish(
  dish: SnapshotDish,
  priceCents: number,
  available: boolean,
): MenuDish {
  return {
    id: dish.id,
    name: dish.name,
    description: dish.description,
    priceCents,
    currency: dish.currency,
    available,
  };
}

/**
 * Combines what the business published with what the branch published (ADR-0003, ADR-0036).
 * Only published snapshots come in, so no draft can reach a diner. Hidden dishes are left
 * out, unavailable ones stay marked, a branch price replaces the base price, and empty
 * categories are omitted. Own dishes whose category the business has not published are
 * left out too; publishing the branch refuses them first (CATEGORY_NOT_PUBLISHED).
 */
export function composeMenu(
  base: BaseSnapshot,
  branch: BranchSnapshot,
): MenuContent {
  const overrides = new Map(
    branch.overrides.map((override) => [override.dishId, override]),
  );
  const categoryIds = new Set(base.categories.map((category) => category.id));

  const placed: Placed[] = [];
  for (const dish of base.dishes) {
    const override = overrides.get(dish.id);
    if (override?.hidden) continue;
    placed.push({
      categoryId: dish.categoryId,
      position: dish.position,
      dish: menuDish(
        dish,
        override?.priceCents ?? dish.priceCents,
        override?.available ?? true,
      ),
    });
  }
  for (const dish of branch.dishes) {
    if (!categoryIds.has(dish.categoryId)) continue;
    placed.push({
      categoryId: dish.categoryId,
      position: dish.position,
      dish: menuDish(dish, dish.priceCents, dish.available),
    });
  }

  const dishesByCategory = new Map<string, Placed[]>();
  for (const entry of placed) {
    const list = dishesByCategory.get(entry.categoryId) ?? [];
    list.push(entry);
    dishesByCategory.set(entry.categoryId, list);
  }

  const categories: MenuCategory[] = [...base.categories]
    .sort(byPlacement)
    .flatMap((category) => {
      const dishes = (dishesByCategory.get(category.id) ?? [])
        .sort((a, b) =>
          byPlacement(
            { position: a.position, name: a.dish.name, id: a.dish.id },
            { position: b.position, name: b.dish.name, id: b.dish.id },
          ),
        )
        .map((entry) => entry.dish);
      return dishes.length > 0
        ? [{ id: category.id, name: category.name, dishes }]
        : [];
    });

  return { profile: branch.profile ?? base.profile, categories };
}
