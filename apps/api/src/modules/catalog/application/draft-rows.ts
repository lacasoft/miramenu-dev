import {
  CATALOG_ERROR_CODES,
  type Category,
  type Dish,
  type Profile,
} from '@miramenu/contracts';
import type { EntityManager } from 'typeorm';
import { selectRows } from '../../../infrastructure/database/query';
import { categoryNotFound, conflict } from './errors';

/** SQL pieces shared by the base and branch drafts. */

export interface CategoryRow {
  id: string;
  name: string;
  position: number;
}

export interface DishRow {
  id: string;
  category_id: string;
  name: string;
  description: string;
  price_cents: number;
  currency: string;
  position: number;
  available: boolean;
}

export const DISH_RETURNING = `RETURNING id, category_id, name, description, price_cents, currency, position, available`;

export const toCategory = (row: CategoryRow): Category => ({
  id: row.id,
  name: row.name,
  position: row.position,
});

export const toDish = (row: DishRow): Dish => ({
  id: row.id,
  categoryId: row.category_id,
  name: row.name,
  description: row.description,
  priceCents: row.price_cents,
  currency: row.currency,
  position: row.position,
});

/**
 * The category must be a live one of the same business (ADR-0019: ids in the body are
 * checked against the business). FOR KEY SHARE holds it until commit, so a concurrent
 * removal either waits and sees this dish, or wins and this check finds nothing.
 */
export async function assertCategory(
  manager: EntityManager,
  businessId: string,
  categoryId: string,
): Promise<void> {
  const [row] = await selectRows(
    manager,
    `SELECT 1 FROM catalog.category
     WHERE id = $1 AND business_id = $2 AND removed_at IS NULL FOR KEY SHARE`,
    [categoryId, businessId],
  );
  if (!row) throw categoryNotFound();
}

/** Refuses a new row past the menu's bounds (MENU_LIMITS). */
export async function assertBelowLimit(
  manager: EntityManager,
  countSql: string,
  parameters: unknown[],
  limit: number,
): Promise<void> {
  const [{ total }] = await selectRows<{ total: number }>(
    manager,
    countSql,
    parameters,
  );
  if (total >= limit) {
    throw conflict(
      CATALOG_ERROR_CODES.MENU_LIMIT_REACHED,
      `A menu holds at most ${limit} of these`,
    );
  }
}

/** Upserts the business's profile (branchId null) or a branch's own one. */
export async function saveProfile(
  manager: EntityManager,
  businessId: string,
  branchId: string | null,
  profile: Profile,
): Promise<Profile> {
  await manager.query(
    `INSERT INTO catalog.profile (business_id, branch_id, name, social_links)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT ON CONSTRAINT uq_profile
     DO UPDATE SET name = EXCLUDED.name, social_links = EXCLUDED.social_links, updated_at = now()`,
    [businessId, branchId, profile.name, JSON.stringify(profile.socialLinks)],
  );
  return profile;
}

/** Next position after the last one, capped at the maximum. */
export const nextPosition = (scopeSql: string) =>
  `(SELECT LEAST(COALESCE(MAX(position) + 1, 0), 10000) FROM ${scopeSql})`;
