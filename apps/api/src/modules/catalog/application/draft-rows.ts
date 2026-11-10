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
  image_media_id: string | null;
  video_media_id: string | null;
}

export const DISH_RETURNING = `RETURNING id, category_id, name, description, price_cents, currency, position, available,
  image_media_id, video_media_id`;

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
  imageId: row.image_media_id,
  videoId: row.video_media_id,
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
    `INSERT INTO catalog.profile (business_id, branch_id, name, social_links, logo_media_id)
     VALUES ($1, $2, $3, $4::jsonb, $5)
     ON CONFLICT ON CONSTRAINT uq_profile
     DO UPDATE SET name = EXCLUDED.name, social_links = EXCLUDED.social_links,
       logo_media_id = EXCLUDED.logo_media_id, updated_at = now()`,
    [
      businessId,
      branchId,
      profile.name,
      JSON.stringify(profile.socialLinks),
      profile.logoId,
    ],
  );
  return profile;
}

/** Next position after the last one, capped at the maximum. */
export const nextPosition = (scopeSql: string) =>
  `(SELECT LEAST(COALESCE(MAX(position) + 1, 0), 10000) FROM ${scopeSql})`;

/** SET fragment for a dish's media: each changes only when the update names it (null detaches). */
export function dishMediaUpdate(
  first: number,
  input: { imageId?: string | null; videoId?: string | null },
): { sql: string; parameters: unknown[] } {
  const at = (offset: number) => `$${first + offset}`;
  return {
    sql: `image_media_id = CASE WHEN ${at(0)}::boolean THEN ${at(1)}::uuid ELSE image_media_id END,
      video_media_id = CASE WHEN ${at(2)}::boolean THEN ${at(3)}::uuid ELSE video_media_id END`,
    parameters: [
      input.imageId !== undefined,
      input.imageId ?? null,
      input.videoId !== undefined,
      input.videoId ?? null,
    ],
  };
}
