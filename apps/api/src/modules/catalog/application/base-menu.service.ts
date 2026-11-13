import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  type BusinessMenuDraft,
  CATALOG_ERROR_CODES,
  type Category,
  type Dish,
  MENU_LIMITS,
  type Profile,
} from '@miramenu/contracts';
import type { DataSource, EntityManager } from 'typeorm';
import {
  returningRows,
  selectRows,
} from '../../../infrastructure/database/query';
import { AccessControl, type Actor } from '../../business-access';
import { scanConflicts } from './conflict-scan';
import { DraftState } from './draft-state';
import {
  assertBelowLimit,
  assertCategory,
  type CategoryRow,
  DISH_RETURNING,
  dishMediaUpdate,
  type DishRow,
  nextPosition,
  saveProfile,
  toCategory,
  toDish,
} from './draft-rows';
import { conflict, notFound } from './errors';
import { assertMediaRef, assertMediaRefs, type MediaScope } from './media-refs';
import { MediaView, usedMediaIds } from './media-view';
import {
  baseCategories,
  baseDishes,
  liveDishes,
  profileOf,
} from './menu-store';

export interface CategoryInput {
  name: string;
  position?: number;
}

export interface DishInput {
  categoryId: string;
  name: string;
  description: string;
  priceCents: number;
  currency: string;
  imageId: string | null;
  videoId: string | null;
  position?: number;
}

/** The business's own media only: never a branch's (ADR-0038). */
const businessScope = (businessId: string): MediaScope => ({
  businessId,
  branchId: null,
});

/**
 * The business's base menu draft: categories, dishes and profile. Changes stay in the
 * draft until the business publishes (design: "Los cambios del CMS se guardan como
 * temporales"). Only its business admin and the superadmin change it; its branch admins
 * may read it, to adjust their branch.
 */
@Injectable()
export class BaseMenuService {
  constructor(
    @InjectDataSource('catalog') private readonly dataSource: DataSource,
    private readonly access: AccessControl,
    private readonly state: DraftState,
    private readonly mediaView: MediaView,
  ) {}

  /** Read in one snapshot, so the draft version matches the content it comes with. */
  async draft(actor: Actor, businessId: string): Promise<BusinessMenuDraft> {
    this.access.assertBusiness(actor, businessId, 'view');
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      const [state] = await selectRows<{
        draft_version: number;
        published_version: number | null;
      }>(
        manager,
        `SELECT draft_version, published_version FROM catalog.business_state WHERE business_id = $1`,
        [businessId],
      );
      if (!state) {
        await this.state.assertBusinessExists(businessId);
        return {
          draftVersion: 0,
          publishedVersion: null,
          profile: null,
          categories: [],
          dishes: [],
          conflicts: [],
          media: [],
        };
      }
      const dishes = await baseDishes(manager, businessId);
      const live = liveDishes(dishes);
      const profile = await profileOf(manager, businessId, null);
      return {
        draftVersion: state.draft_version,
        publishedVersion: state.published_version,
        profile,
        categories: await baseCategories(manager, businessId),
        dishes: live,
        conflicts: (await scanConflicts(manager, businessId, dishes)).conflicts,
        media: await this.mediaView.among(
          manager,
          businessId,
          usedMediaIds(profile, live),
        ),
      };
    });
  }

  createCategory(
    actor: Actor,
    businessId: string,
    input: CategoryInput,
  ): Promise<Category> {
    return this.edit(actor, businessId, async (manager) => {
      await assertBelowLimit(
        manager,
        `SELECT count(*)::int AS total FROM catalog.category WHERE business_id = $1 AND removed_at IS NULL`,
        [businessId],
        MENU_LIMITS.categoriesPerBusiness,
      );
      const [row] = await selectRows<CategoryRow>(
        manager,
        `INSERT INTO catalog.category (business_id, name, position)
         VALUES ($1, $2, COALESCE($3, ${nextPosition('catalog.category WHERE business_id = $1 AND removed_at IS NULL')}))
         RETURNING id, name, position`,
        [businessId, input.name, input.position ?? null],
      );
      return toCategory(row);
    });
  }

  updateCategory(
    actor: Actor,
    businessId: string,
    categoryId: string,
    input: Partial<CategoryInput>,
  ): Promise<Category> {
    return this.edit(actor, businessId, async (manager) => {
      const [row] = await returningRows<CategoryRow>(
        manager,
        `UPDATE catalog.category
         SET name = COALESCE($3, name), position = COALESCE($4, position), updated_at = now()
         WHERE id = $1 AND business_id = $2 AND removed_at IS NULL
         RETURNING id, name, position`,
        [categoryId, businessId, input.name ?? null, input.position ?? null],
      );
      if (!row) throw notFound();
      return toCategory(row);
    });
  }

  /** A category with live dishes, of the business or of any branch, cannot go. */
  removeCategory(
    actor: Actor,
    businessId: string,
    categoryId: string,
  ): Promise<void> {
    return this.edit(actor, businessId, async (manager) => {
      const [category] = await selectRows(
        manager,
        `SELECT 1 FROM catalog.category
         WHERE id = $1 AND business_id = $2 AND removed_at IS NULL FOR UPDATE`,
        [categoryId, businessId],
      );
      if (!category) throw notFound();
      const [inUse] = await selectRows(
        manager,
        `SELECT 1 FROM catalog.dish WHERE category_id = $1 AND removed_at IS NULL LIMIT 1`,
        [categoryId],
      );
      if (inUse) {
        throw conflict(
          CATALOG_ERROR_CODES.CATEGORY_IN_USE,
          'The category still has dishes',
        );
      }
      await manager.query(
        `UPDATE catalog.category SET removed_at = now(), updated_at = now() WHERE id = $1`,
        [categoryId],
      );
    });
  }

  createDish(
    actor: Actor,
    businessId: string,
    input: DishInput,
  ): Promise<Dish> {
    return this.edit(actor, businessId, async (manager) => {
      await assertBelowLimit(
        manager,
        `SELECT count(*)::int AS total FROM catalog.dish
         WHERE business_id = $1 AND branch_id IS NULL AND removed_at IS NULL`,
        [businessId],
        MENU_LIMITS.dishesPerBusiness,
      );
      await assertCategory(manager, businessId, input.categoryId);
      await assertMediaRefs(manager, businessScope(businessId), input);
      const [row] = await selectRows<DishRow>(
        manager,
        `INSERT INTO catalog.dish
           (business_id, category_id, name, description, price_cents, currency, image_media_id, video_media_id, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, ${nextPosition(
           'catalog.dish WHERE category_id = $2 AND branch_id IS NULL AND removed_at IS NULL',
         )}))
         ${DISH_RETURNING}`,
        [
          businessId,
          input.categoryId,
          input.name,
          input.description,
          input.priceCents,
          input.currency,
          input.imageId,
          input.videoId,
          input.position ?? null,
        ],
      );
      return toDish(row);
    });
  }

  updateDish(
    actor: Actor,
    businessId: string,
    dishId: string,
    input: Partial<DishInput>,
  ): Promise<Dish> {
    return this.edit(actor, businessId, async (manager) => {
      if (input.categoryId !== undefined) {
        await assertCategory(manager, businessId, input.categoryId);
      }
      await assertMediaRefs(manager, businessScope(businessId), input);
      const media = dishMediaUpdate(9, input);
      const [row] = await returningRows<DishRow>(
        manager,
        `UPDATE catalog.dish SET
           category_id = COALESCE($3, category_id), name = COALESCE($4, name),
           description = COALESCE($5, description), price_cents = COALESCE($6, price_cents),
           currency = COALESCE($7, currency), position = COALESCE($8, position),
           ${media.sql}, updated_at = now()
         WHERE id = $1 AND business_id = $2 AND branch_id IS NULL AND removed_at IS NULL
         ${DISH_RETURNING}`,
        [
          dishId,
          businessId,
          input.categoryId ?? null,
          input.name ?? null,
          input.description ?? null,
          input.priceCents ?? null,
          input.currency ?? null,
          input.position ?? null,
          ...media.parameters,
        ],
      );
      if (!row) throw notFound();
      return toDish(row);
    });
  }

  /** Kept as removed: the branches' adjustments of it are conflicts until the business publishes. */
  removeDish(actor: Actor, businessId: string, dishId: string): Promise<void> {
    return this.edit(actor, businessId, async (manager) => {
      const [row] = await returningRows(
        manager,
        `UPDATE catalog.dish SET removed_at = now(), updated_at = now()
         WHERE id = $1 AND business_id = $2 AND branch_id IS NULL AND removed_at IS NULL
         RETURNING id`,
        [dishId, businessId],
      );
      if (!row) throw notFound();
    });
  }

  putProfile(
    actor: Actor,
    businessId: string,
    profile: Profile,
  ): Promise<Profile> {
    return this.edit(actor, businessId, async (manager) => {
      if (profile.logoId) {
        await assertMediaRef(
          manager,
          businessScope(businessId),
          profile.logoId,
          'image',
        );
      }
      return saveProfile(manager, businessId, null, profile);
    });
  }

  /** Every edit checks the permission, then bumps the draft version in the same transaction. */
  private edit<T>(
    actor: Actor,
    businessId: string,
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    this.access.assertBusiness(actor, businessId, 'administer');
    return this.dataSource.transaction(async (manager) => {
      await this.state.bumpBusinessDraft(manager, businessId);
      return work(manager);
    });
  }
}
