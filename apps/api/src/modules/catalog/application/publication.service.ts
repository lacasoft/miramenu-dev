import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  CATALOG_ERROR_CODES,
  type ConflictRef,
  type Publication,
  type PublicationConflict,
} from '@miramenu/contracts';
import type { DataSource, EntityManager } from 'typeorm';
import { selectRows } from '../../../infrastructure/database/query';
import {
  AccessControl,
  type Actor,
  BranchDirectory,
  type BranchRef,
} from '../../business-access';
import { composeMenu } from '../domain/compose-menu';
import {
  overwriteAdjustments,
  unconfirmedConflicts,
} from '../domain/conflicts';
import {
  type BaseSnapshot,
  type BranchSnapshot,
  EMPTY_BRANCH_SNAPSHOT,
} from '../domain/menu-snapshot';
import { type ConflictScan, scanConflicts } from './conflict-scan';
import { DraftState } from './draft-state';
import { conflict, notFound } from './errors';
import {
  baseCategories,
  baseDishes,
  baseSnapshotOf,
  branchDishes,
  latestPublishedBase,
  overridesOfBranch,
  profileOf,
  type Published,
} from './menu-store';
import {
  fingerprintOf,
  insertPublication,
  insertPublishedBase,
  insertPublishedBranch,
  insertPublishedMenu,
  previousPublication,
  type PublicationRequest,
} from './publication-records';
import { PublishedMenuService } from './published-menu.service';

export interface BusinessPublicationInput {
  draftVersion: number;
  confirmedConflicts: ConflictRef[];
}

export interface BranchPublicationInput {
  draftVersion: number;
}

interface Outcome {
  publication: Publication;
  /** False when a retry got the original publication: nothing changed. */
  isNew: boolean;
}

interface BranchStateRow {
  branch_id: string;
  published_version: number | null;
  menu_version: number | null;
}

const draftChanged = () =>
  conflict(
    CATALOG_ERROR_CODES.DRAFT_CHANGED,
    'The draft changed since it was reviewed; review it again',
  );

const nextVersion = (current: number | null) => (current ?? 0) + 1;

/** A branch's own dish needs a category its business already published. */
function assertCategoriesPublished(
  snapshot: BranchSnapshot,
  base: BaseSnapshot,
): void {
  const published = new Set(base.categories.map((category) => category.id));
  if (snapshot.dishes.some((dish) => !published.has(dish.categoryId))) {
    throw conflict(
      CATALOG_ERROR_CODES.CATEGORY_NOT_PUBLISHED,
      'An own dish is in a category the business has not published yet',
    );
  }
}

/**
 * Publishing (ADR-0003, ADR-0036): the business publishes its base menu and each branch
 * its adjustments, separately. Each publication runs in one transaction, holds the lock of
 * what it publishes, is refused if the draft changed since it was reviewed, and returns the
 * original result when retried with the same idempotency key (design: flujo publicar).
 */
@Injectable()
export class PublicationService {
  constructor(
    @InjectDataSource('catalog') private readonly dataSource: DataSource,
    private readonly access: AccessControl,
    private readonly directory: BranchDirectory,
    private readonly state: DraftState,
    private readonly menus: PublishedMenuService,
  ) {}

  /**
   * Publishes the base menu and a new menu for every branch of the business. Conflicts with
   * branch adjustments are refused until the admin confirms every one of them; confirmed
   * ones are overwritten in the branch's draft and in what the branch published.
   */
  async publishBusiness(
    actor: Actor,
    businessId: string,
    idempotencyKey: string,
    input: BusinessPublicationInput,
  ): Promise<Publication> {
    this.access.assertBusiness(actor, businessId, 'administer');
    const branchIds = await this.directory.branchIdsOf(businessId);
    if (branchIds === null) throw notFound();
    const request: PublicationRequest = {
      scope: 'business',
      scopeId: businessId,
      idempotencyKey,
      fingerprint: fingerprintOf({
        draftVersion: input.draftVersion,
        confirmed: input.confirmedConflicts
          .map((ref) => `${ref.branchId}:${ref.dishId}`)
          .sort(),
      }),
    };
    const outcome = await this.dataSource.transaction((manager) =>
      this.publishBaseIn(manager, actor, branchIds, request, input),
    );
    if (outcome.isNew) {
      await this.menus.invalidate(
        outcome.publication.menus.map((m) => m.branchId),
      );
    }
    return outcome.publication;
  }

  /** Publishes the branch's adjustments on top of the base menu its business published last. */
  async publishBranch(
    actor: Actor,
    branchId: string,
    idempotencyKey: string,
    input: BranchPublicationInput,
  ): Promise<Publication> {
    const branch = await this.access.assertBranch(actor, branchId, 'operate');
    const request: PublicationRequest = {
      scope: 'branch',
      scopeId: branch.id,
      idempotencyKey,
      fingerprint: fingerprintOf({ draftVersion: input.draftVersion }),
    };

    const outcome = await this.dataSource.transaction((manager) =>
      this.publishBranchIn(manager, actor, branch, request, input),
    );
    if (outcome.isNew) await this.menus.invalidate([branch.id]);
    return outcome.publication;
  }

  /** The business publication, inside its transaction and under its locks. */
  private async publishBaseIn(
    manager: EntityManager,
    actor: Actor,
    branchIds: readonly string[],
    request: PublicationRequest,
    input: BusinessPublicationInput,
  ): Promise<Outcome> {
    const businessId = request.scopeId;
    await this.ensureStates(manager, businessId, branchIds);
    const [business] = await selectRows<{
      draft_version: number;
      published_version: number | null;
    }>(
      manager,
      `SELECT draft_version, published_version FROM catalog.business_state
       WHERE business_id = $1 FOR UPDATE`,
      [businessId],
    );
    const previous = await previousPublication(manager, request);
    if (previous) return { publication: previous, isNew: false };
    if (business.draft_version !== input.draftVersion) throw draftChanged();

    const branches = await selectRows<BranchStateRow>(
      manager,
      `SELECT branch_id, published_version, menu_version FROM catalog.branch_state
       WHERE business_id = $1 ORDER BY branch_id FOR UPDATE`,
      [businessId],
    );
    const { base, scan } = await this.publishableBase(
      manager,
      businessId,
      input.confirmedConflicts,
    );
    const publication: Publication = {
      id: randomUUID(),
      scope: 'business',
      version: nextVersion(business.published_version),
      publishedAt: new Date().toISOString(),
      menus: branches.map((branch) => ({
        branchId: branch.branch_id,
        version: nextVersion(branch.menu_version),
      })),
    };
    await insertPublication(manager, request, actor.userId, publication);
    const published = await this.overwrite(
      manager,
      businessId,
      scan,
      branches,
      publication,
    );
    await insertPublishedBase(manager, {
      businessId,
      version: publication.version,
      content: base,
      publicationId: publication.id,
      publishedAt: publication.publishedAt,
    });
    for (const [index, branch] of branches.entries()) {
      const adjustments = published.get(branch.branch_id);
      await insertPublishedMenu(manager, {
        branchId: branch.branch_id,
        businessId,
        version: publication.menus[index].version,
        baseVersion: publication.version,
        branchVersion: adjustments?.version ?? null,
        content: composeMenu(
          base,
          adjustments?.content ?? EMPTY_BRANCH_SNAPSHOT,
        ),
        publicationId: publication.id,
        publishedAt: publication.publishedAt,
      });
    }
    return { publication, isNew: true };
  }

  /** The base draft as it would be published; refused without a profile or with unconfirmed conflicts. */
  private async publishableBase(
    manager: EntityManager,
    businessId: string,
    confirmed: readonly ConflictRef[],
  ): Promise<{ base: BaseSnapshot; scan: ConflictScan }> {
    const profile = await profileOf(manager, businessId, null);
    if (!profile) {
      throw conflict(
        CATALOG_ERROR_CODES.PROFILE_REQUIRED,
        'The business needs a profile before its first publication',
      );
    }
    const dishes = await baseDishes(manager, businessId);
    const scan = await scanConflicts(manager, businessId, dishes);
    if (unconfirmedConflicts(scan.conflicts, confirmed).length > 0) {
      throw conflict(
        CATALOG_ERROR_CODES.PUBLICATION_CONFLICTS,
        'Publishing would overwrite branch adjustments that were not confirmed; review the draft',
      );
    }
    const categories = await baseCategories(manager, businessId);
    return { base: baseSnapshotOf(profile, categories, dishes), scan };
  }

  /** The branch publication, inside its transaction and under its locks. */
  private async publishBranchIn(
    manager: EntityManager,
    actor: Actor,
    branch: BranchRef,
    request: PublicationRequest,
    input: BranchPublicationInput,
  ): Promise<Outcome> {
    await this.state.ensureBranch(manager, branch);
    // Waits for a base publication in progress, without blocking other branches.
    await manager.query(
      `SELECT 1 FROM catalog.business_state WHERE business_id = $1 FOR KEY SHARE`,
      [branch.businessId],
    );
    const [state] = await selectRows<
      BranchStateRow & { draft_version: number }
    >(
      manager,
      `SELECT branch_id, draft_version, published_version, menu_version
       FROM catalog.branch_state WHERE branch_id = $1 FOR UPDATE`,
      [branch.id],
    );
    const previous = await previousPublication(manager, request);
    if (previous) return { publication: previous, isNew: false };
    if (state.draft_version !== input.draftVersion) throw draftChanged();

    const base = await latestPublishedBase(manager, branch.businessId);
    if (!base) {
      throw conflict(
        CATALOG_ERROR_CODES.BASE_MENU_NOT_PUBLISHED,
        'The business has not published its base menu yet',
      );
    }
    const snapshot = await this.branchSnapshot(manager, branch);
    assertCategoriesPublished(snapshot, base.content);

    const publication: Publication = {
      id: randomUUID(),
      scope: 'branch',
      version: nextVersion(state.published_version),
      publishedAt: new Date().toISOString(),
      menus: [
        { branchId: branch.id, version: nextVersion(state.menu_version) },
      ],
    };
    await insertPublication(manager, request, actor.userId, publication);
    await insertPublishedBranch(manager, {
      branchId: branch.id,
      businessId: branch.businessId,
      version: publication.version,
      content: snapshot,
      publicationId: publication.id,
      publishedAt: publication.publishedAt,
    });
    await insertPublishedMenu(manager, {
      branchId: branch.id,
      businessId: branch.businessId,
      version: publication.menus[0].version,
      baseVersion: base.version,
      branchVersion: publication.version,
      content: composeMenu(base.content, snapshot),
      publicationId: publication.id,
      publishedAt: publication.publishedAt,
    });
    return { publication, isNew: true };
  }

  /** Every branch the directory knows gets its state row, so each one receives a menu. */
  private async ensureStates(
    manager: EntityManager,
    businessId: string,
    branchIds: readonly string[],
  ): Promise<void> {
    await manager.query(
      `INSERT INTO catalog.business_state (business_id) VALUES ($1) ON CONFLICT DO NOTHING`,
      [businessId],
    );
    await manager.query(
      `INSERT INTO catalog.branch_state (branch_id, business_id)
       SELECT unnest($1::uuid[]), $2 ON CONFLICT DO NOTHING`,
      [branchIds, businessId],
    );
  }

  /**
   * Overwrites the confirmed conflicts: in each branch's draft (bumping its draft version,
   * so a branch admin reviewing it sees the change) and, when the branch had published the
   * adjustment, in a new published version of the branch copied from its last one, never
   * from its draft. Returns what each branch has published after that.
   */
  private async overwrite(
    manager: EntityManager,
    businessId: string,
    scan: ConflictScan,
    branches: readonly BranchStateRow[],
    publication: Publication,
  ): Promise<Map<string, Published<BranchSnapshot>>> {
    const published = new Map(scan.publishedBranches);
    const byBranch = new Map<string, PublicationConflict[]>();
    for (const item of scan.conflicts) {
      byBranch.set(item.branchId, [
        ...(byBranch.get(item.branchId) ?? []),
        item,
      ]);
    }
    for (const [branchId, conflicts] of byBranch) {
      const dishesWith = (reason: PublicationConflict['reason']) =>
        conflicts.filter((c) => c.reason === reason).map((c) => c.dishId);
      await manager.query(
        `DELETE FROM catalog.branch_override WHERE branch_id = $1 AND dish_id = ANY($2::uuid[])`,
        [branchId, dishesWith('dish_removed')],
      );
      await manager.query(
        `UPDATE catalog.branch_override SET price_cents = NULL, updated_at = now()
         WHERE branch_id = $1 AND dish_id = ANY($2::uuid[])`,
        [branchId, dishesWith('price_changed')],
      );
      await manager.query(
        `UPDATE catalog.branch_state SET draft_version = draft_version + 1 WHERE branch_id = $1`,
        [branchId],
      );

      const last = published.get(branchId);
      const state = branches.find((branch) => branch.branch_id === branchId);
      if (!last || !state) continue;
      const overrides = overwriteAdjustments(last.content.overrides, conflicts);
      if (JSON.stringify(overrides) === JSON.stringify(last.content.overrides))
        continue;
      const next = {
        version: nextVersion(state.published_version),
        content: { ...last.content, overrides },
      };
      await insertPublishedBranch(manager, {
        branchId,
        businessId,
        version: next.version,
        content: next.content,
        publicationId: publication.id,
        publishedAt: publication.publishedAt,
      });
      published.set(branchId, next);
    }
    return published;
  }

  private async branchSnapshot(
    manager: EntityManager,
    branch: BranchRef,
  ): Promise<BranchSnapshot> {
    return {
      profile: await profileOf(manager, branch.businessId, branch.id),
      overrides: await overridesOfBranch(manager, branch.id),
      dishes: await branchDishes(manager, branch.id),
    };
  }
}
