import type { Profile } from '@miramenu/contracts';
import type { EntityManager } from 'typeorm';
import { selectRows } from '../../../infrastructure/database/query';
import type {
  BaseSnapshot,
  BranchSnapshot,
  SnapshotBranchDish,
  SnapshotCategory,
  SnapshotDish,
  SnapshotOverride,
} from '../domain/menu-snapshot';

/** Reads of Catalog's own tables, shared by the draft and publication services. */

interface DishRow {
  id: string;
  category_id: string;
  name: string;
  description: string;
  price_cents: number;
  currency: string;
  position: number;
  available: boolean;
  removed_at: Date | null;
}

interface OverrideRow {
  branch_id: string;
  dish_id: string;
  price_cents: number | null;
  available: boolean;
  hidden: boolean;
}

export interface DraftBaseDishRow extends SnapshotDish {
  removed: boolean;
}

export interface Published<T> {
  version: number;
  content: T;
}

const DISH_COLUMNS = `id, category_id, name, description, price_cents, currency, position, available, removed_at`;
const ORDER = `ORDER BY position, name COLLATE "C", id`;

const toDish = (row: DishRow): SnapshotDish => ({
  id: row.id,
  categoryId: row.category_id,
  name: row.name,
  description: row.description,
  priceCents: row.price_cents,
  currency: row.currency,
  position: row.position,
});

const toOverride = (row: OverrideRow): SnapshotOverride => ({
  dishId: row.dish_id,
  priceCents: row.price_cents,
  available: row.available,
  hidden: row.hidden,
});

export function baseCategories(
  manager: EntityManager,
  businessId: string,
): Promise<SnapshotCategory[]> {
  return selectRows<SnapshotCategory>(
    manager,
    `SELECT id, name, position FROM catalog.category
     WHERE business_id = $1 AND removed_at IS NULL ${ORDER}`,
    [businessId],
  );
}

/** Every base dish, removed ones included: their branch adjustments are conflicts. */
export async function baseDishes(
  manager: EntityManager,
  businessId: string,
): Promise<DraftBaseDishRow[]> {
  const rows = await selectRows<DishRow>(
    manager,
    `SELECT ${DISH_COLUMNS} FROM catalog.dish
     WHERE business_id = $1 AND branch_id IS NULL ${ORDER}`,
    [businessId],
  );
  return rows.map((row) => ({
    ...toDish(row),
    removed: row.removed_at !== null,
  }));
}

export async function branchDishes(
  manager: EntityManager,
  branchId: string,
): Promise<SnapshotBranchDish[]> {
  const rows = await selectRows<DishRow>(
    manager,
    `SELECT ${DISH_COLUMNS} FROM catalog.dish WHERE branch_id = $1 ${ORDER}`,
    [branchId],
  );
  return rows.map((row) => ({ ...toDish(row), available: row.available }));
}

export async function overridesOfBranch(
  manager: EntityManager,
  branchId: string,
): Promise<SnapshotOverride[]> {
  const rows = await selectRows<OverrideRow>(
    manager,
    `SELECT branch_id, dish_id, price_cents, available, hidden
     FROM catalog.branch_override WHERE branch_id = $1 ORDER BY dish_id`,
    [branchId],
  );
  return rows.map(toOverride);
}

/** The draft adjustments of every branch of a business, by branch. */
export async function overridesOfBusiness(
  manager: EntityManager,
  businessId: string,
): Promise<Map<string, SnapshotOverride[]>> {
  const rows = await selectRows<OverrideRow>(
    manager,
    `SELECT branch_id, dish_id, price_cents, available, hidden
     FROM catalog.branch_override WHERE business_id = $1 ORDER BY branch_id, dish_id`,
    [businessId],
  );
  const byBranch = new Map<string, SnapshotOverride[]>();
  for (const row of rows) {
    byBranch.set(row.branch_id, [
      ...(byBranch.get(row.branch_id) ?? []),
      toOverride(row),
    ]);
  }
  return byBranch;
}

/** The business's profile (branchId null) or a branch's own one. */
export async function profileOf(
  manager: EntityManager,
  businessId: string,
  branchId: string | null,
): Promise<Profile | null> {
  const [row] = await selectRows<{
    name: string;
    social_links: Profile['socialLinks'];
  }>(
    manager,
    `SELECT name, social_links FROM catalog.profile
     WHERE business_id = $1 AND branch_id IS NOT DISTINCT FROM $2`,
    [businessId, branchId],
  );
  return row ? { name: row.name, socialLinks: row.social_links } : null;
}

/** The base menu the business published last, or null before its first publication. */
export async function latestPublishedBase(
  manager: EntityManager,
  businessId: string,
): Promise<Published<BaseSnapshot> | null> {
  const [row] = await selectRows<Published<BaseSnapshot>>(
    manager,
    `SELECT pb.version, pb.content FROM catalog.business_state bs
     JOIN catalog.published_base pb
       ON pb.business_id = bs.business_id AND pb.version = bs.published_version
     WHERE bs.business_id = $1`,
    [businessId],
  );
  return row ?? null;
}

/** What each branch of the business published last, by branch. */
export async function latestPublishedBranches(
  manager: EntityManager,
  businessId: string,
): Promise<Map<string, Published<BranchSnapshot>>> {
  const rows = await selectRows<
    Published<BranchSnapshot> & { branch_id: string }
  >(
    manager,
    `SELECT pb.branch_id, pb.version, pb.content FROM catalog.branch_state bs
     JOIN catalog.published_branch pb
       ON pb.branch_id = bs.branch_id AND pb.version = bs.published_version
     WHERE bs.business_id = $1`,
    [businessId],
  );
  return new Map(
    rows.map((row) => [
      row.branch_id,
      { version: row.version, content: row.content },
    ]),
  );
}

/** The base dishes still in the draft, without the removed flag. */
export function liveDishes(
  dishes: readonly DraftBaseDishRow[],
): SnapshotDish[] {
  return dishes.flatMap(({ removed, ...dish }) => (removed ? [] : [dish]));
}

/** The base snapshot a publication of this draft stores: removed entities left out. */
export function baseSnapshotOf(
  profile: Profile,
  categories: readonly SnapshotCategory[],
  dishes: readonly DraftBaseDishRow[],
): BaseSnapshot {
  return { profile, categories: [...categories], dishes: liveDishes(dishes) };
}
