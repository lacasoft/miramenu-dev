import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  type BranchDish,
  type BranchMenuDraft,
  MENU_LIMITS,
  type Override,
  type Profile,
} from '@miramenu/contracts';
import type { DataSource, EntityManager } from 'typeorm';
import {
  returningRows,
  selectRows,
} from '../../../infrastructure/database/query';
import {
  AccessControl,
  type Actor,
  type BranchRef,
} from '../../business-access';
import { DraftState } from './draft-state';
import {
  assertBelowLimit,
  assertCategory,
  DISH_RETURNING,
  dishMediaUpdate,
  type DishRow,
  nextPosition,
  saveProfile,
  toDish,
} from './draft-rows';
import { notFound } from './errors';
import { assertMediaRef, assertMediaRefs, type MediaScope } from './media-refs';
import { branchDishes, overridesOfBranch, profileOf } from './menu-store';
import type { DishInput } from './base-menu.service';

export interface BranchDishInput extends DishInput {
  available: boolean;
}

export interface OverrideInput {
  priceCents: number | null;
  available: boolean;
  hidden: boolean;
}

/** A branch uses its business's media and its own, never a sibling's (ADR-0038). */
const branchScope = (branch: BranchRef): MediaScope => ({
  businessId: branch.businessId,
  branchId: branch.id,
});

const toBranchDish = (row: DishRow): BranchDish => ({
  ...toDish(row),
  available: row.available,
});

/**
 * A branch's draft: adjustments to base dishes (price, availability, hidden), its own
 * dishes and its own profile (design: "La sucursal ajusta precio y disponibilidad, oculta
 * platillos y agrega los suyos"). Its branch admin, its business admin and the superadmin
 * may change it ('operate'); a branch admin of another branch sees nothing of it.
 */
@Injectable()
export class BranchMenuService {
  constructor(
    @InjectDataSource('catalog') private readonly dataSource: DataSource,
    private readonly access: AccessControl,
    private readonly state: DraftState,
  ) {}

  async draft(actor: Actor, branchId: string): Promise<BranchMenuDraft> {
    const branch = await this.access.assertBranch(actor, branchId, 'view');
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      const [state] = await selectRows<{
        draft_version: number;
        published_version: number | null;
      }>(
        manager,
        `SELECT draft_version, published_version FROM catalog.branch_state WHERE branch_id = $1`,
        [branch.id],
      );
      return {
        draftVersion: state?.draft_version ?? 0,
        publishedVersion: state?.published_version ?? null,
        profile: await profileOf(manager, branch.businessId, branch.id),
        overrides: await overridesOfBranch(manager, branch.id),
        dishes: await branchDishes(manager, branch.id),
      };
    });
  }

  /** Adjusts a live base dish of the branch's own business; a repeated PUT replaces it. */
  putOverride(
    actor: Actor,
    branchId: string,
    dishId: string,
    input: OverrideInput,
  ): Promise<Override> {
    return this.edit(actor, branchId, async (manager, branch) => {
      const [dish] = await selectRows(
        manager,
        `SELECT 1 FROM catalog.dish
         WHERE id = $1 AND business_id = $2 AND branch_id IS NULL AND removed_at IS NULL`,
        [dishId, branch.businessId],
      );
      if (!dish) throw notFound();
      const [row] = await selectRows<{
        dish_id: string;
        price_cents: number | null;
        available: boolean;
        hidden: boolean;
      }>(
        manager,
        `INSERT INTO catalog.branch_override (branch_id, dish_id, business_id, price_cents, available, hidden)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT ON CONSTRAINT pk_branch_override DO UPDATE SET
           price_cents = EXCLUDED.price_cents, available = EXCLUDED.available,
           hidden = EXCLUDED.hidden, updated_at = now()
         RETURNING dish_id, price_cents, available, hidden`,
        [
          branch.id,
          dishId,
          branch.businessId,
          input.priceCents,
          input.available,
          input.hidden,
        ],
      );
      return {
        dishId: row.dish_id,
        priceCents: row.price_cents,
        available: row.available,
        hidden: row.hidden,
      };
    });
  }

  deleteOverride(
    actor: Actor,
    branchId: string,
    dishId: string,
  ): Promise<void> {
    return this.edit(actor, branchId, async (manager, branch) => {
      const deleted = await returningRows(
        manager,
        `DELETE FROM catalog.branch_override WHERE branch_id = $1 AND dish_id = $2 RETURNING dish_id`,
        [branch.id, dishId],
      );
      if (deleted.length === 0) throw notFound();
    });
  }

  createDish(
    actor: Actor,
    branchId: string,
    input: BranchDishInput,
  ): Promise<BranchDish> {
    return this.edit(actor, branchId, async (manager, branch) => {
      await assertBelowLimit(
        manager,
        `SELECT count(*)::int AS total FROM catalog.dish WHERE branch_id = $1`,
        [branch.id],
        MENU_LIMITS.dishesPerBranch,
      );
      await assertCategory(manager, branch.businessId, input.categoryId);
      await assertMediaRefs(manager, branchScope(branch), input);
      const [row] = await selectRows<DishRow>(
        manager,
        `INSERT INTO catalog.dish
           (business_id, branch_id, category_id, name, description, price_cents, currency, available,
            image_media_id, video_media_id, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11, ${nextPosition(
           `catalog.dish WHERE category_id = $3 AND removed_at IS NULL
              AND (branch_id IS NULL OR branch_id = $2)`,
         )}))
         ${DISH_RETURNING}`,
        [
          branch.businessId,
          branch.id,
          input.categoryId,
          input.name,
          input.description,
          input.priceCents,
          input.currency,
          input.available,
          input.imageId,
          input.videoId,
          input.position ?? null,
        ],
      );
      return toBranchDish(row);
    });
  }

  updateDish(
    actor: Actor,
    branchId: string,
    dishId: string,
    input: Partial<BranchDishInput>,
  ): Promise<BranchDish> {
    return this.edit(actor, branchId, async (manager, branch) => {
      if (input.categoryId !== undefined) {
        await assertCategory(manager, branch.businessId, input.categoryId);
      }
      await assertMediaRefs(manager, branchScope(branch), input);
      const media = dishMediaUpdate(10, input);
      const [row] = await returningRows<DishRow>(
        manager,
        `UPDATE catalog.dish SET
           category_id = COALESCE($3, category_id), name = COALESCE($4, name),
           description = COALESCE($5, description), price_cents = COALESCE($6, price_cents),
           currency = COALESCE($7, currency), position = COALESCE($8, position),
           available = COALESCE($9, available), ${media.sql}, updated_at = now()
         WHERE id = $1 AND branch_id = $2
         ${DISH_RETURNING}`,
        [
          dishId,
          branch.id,
          input.categoryId ?? null,
          input.name ?? null,
          input.description ?? null,
          input.priceCents ?? null,
          input.currency ?? null,
          input.position ?? null,
          input.available ?? null,
          ...media.parameters,
        ],
      );
      if (!row) throw notFound();
      return toBranchDish(row);
    });
  }

  /** Nobody adjusts a branch's own dish, so it goes at once; its published copy stays until the next publication. */
  deleteDish(actor: Actor, branchId: string, dishId: string): Promise<void> {
    return this.edit(actor, branchId, async (manager, branch) => {
      const deleted = await returningRows(
        manager,
        `DELETE FROM catalog.dish WHERE id = $1 AND branch_id = $2 RETURNING id`,
        [dishId, branch.id],
      );
      if (deleted.length === 0) throw notFound();
    });
  }

  putProfile(
    actor: Actor,
    branchId: string,
    profile: Profile,
  ): Promise<Profile> {
    return this.edit(actor, branchId, async (manager, branch) => {
      if (profile.logoId) {
        await assertMediaRef(
          manager,
          branchScope(branch),
          profile.logoId,
          'image',
        );
      }
      return saveProfile(manager, branch.businessId, branch.id, profile);
    });
  }

  /** Back to the business's profile; repeating it changes nothing. */
  deleteProfile(actor: Actor, branchId: string): Promise<void> {
    return this.edit(actor, branchId, async (manager, branch) => {
      await manager.query(`DELETE FROM catalog.profile WHERE branch_id = $1`, [
        branch.id,
      ]);
    });
  }

  /** The branch's real business is loaded first (ADR-0019), then the draft version is bumped. */
  private async edit<T>(
    actor: Actor,
    branchId: string,
    work: (manager: EntityManager, branch: BranchRef) => Promise<T>,
  ): Promise<T> {
    const branch = await this.access.assertBranch(actor, branchId, 'operate');
    return this.dataSource.transaction(async (manager) => {
      await this.state.bumpBranchDraft(manager, branch);
      return work(manager, branch);
    });
  }
}
