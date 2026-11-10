import type { INestApplication } from '@nestjs/common';
import type { PublishedMenu } from '@miramenu/contracts';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  activateAdmin,
  ADMIN_PASSWORD,
  type AdminClient,
  asOwner,
  type BusinessFixture,
  clientIp,
  createBranch,
  createBusiness,
  ensureSuperadmin,
  login,
  SUPERADMIN,
  unique,
} from './support/admin-fixtures';
import {
  branchDraft,
  businessDraft,
  createCategory,
  createDish,
  idempotencyHeader,
  PROFILE,
  publishBranch,
  publishBusiness,
} from './support/catalog-fixtures';
import { createTestApp } from './support/test-app';

describe('Publishing: conflicts, idempotency and draft versions (e2e)', () => {
  let app: INestApplication<App>;
  let business: BusinessFixture;
  let owner: AdminClient;
  let branchAdmin: AdminClient;
  let branch1: string;
  let branch2: string;
  let pastor: string;
  let suadero: string;
  const ip = clientIp();

  const menuOf = async (branchId: string): Promise<PublishedMenu> =>
    (
      await request(app.getHttpServer())
        .get(`/branches/${branchId}/menu`)
        .expect(200)
    ).body as PublishedMenu;
  const dishIn = (menu: PublishedMenu, dishId: string) =>
    menu.categories.flatMap((c) => c.dishes).find((d) => d.id === dishId);
  const setBasePrice = (dishId: string, priceCents: number) =>
    owner
      .send('patch', `/admin/businesses/${business.id}/dishes/${dishId}`, {
        priceCents,
      })
      .expect(200);
  const adjust = (
    dishId: string,
    override: {
      priceCents: number | null;
      available?: boolean;
      hidden?: boolean;
    },
  ) =>
    branchAdmin
      .send('put', `/admin/branches/${branch1}/overrides/${dishId}`, {
        available: true,
        hidden: false,
        ...override,
      })
      .expect(200);
  const publicationsWith = (key: string) =>
    asOwner(async (client) => {
      const result = await client.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM catalog.publication WHERE idempotency_key = $1`,
        [key],
      );
      return result.rows[0].total;
    });

  beforeAll(async () => {
    app = await createTestApp();
    await ensureSuperadmin();
    const superadmin = await login(
      app,
      SUPERADMIN.email,
      SUPERADMIN.password,
      ip,
    );
    business = await createBusiness(superadmin);
    owner = await login(app, business.adminEmail, ADMIN_PASSWORD, ip);
    branch1 = (await createBranch(owner, business.id)).id;
    branch2 = (await createBranch(owner, business.id)).id;
    const email = `${unique('branch-admin')}@example.test`;
    await owner
      .send('post', `/admin/businesses/${business.id}/users`, {
        email,
        name: 'Branch admin',
        role: { role: 'branch_admin', branchId: branch1 },
      })
      .expect(201);
    await activateAdmin(email);
    branchAdmin = await login(app, email, ADMIN_PASSWORD, ip);

    await owner
      .send('put', `/admin/businesses/${business.id}/profile`, PROFILE)
      .expect(200);
    const tacos = await createCategory(owner, business.id);
    pastor = await createDish(owner, business.id, tacos, {
      name: 'Pastor',
      priceCents: 2500,
    });
    suadero = await createDish(owner, business.id, tacos, {
      name: 'Suadero',
      priceCents: 2800,
    });
    expect((await publishBusiness(owner, business.id)).status).toBe(201);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('draft version (design: flujo publicar, paso 3)', () => {
    it('refuses a business publication of a draft that changed after the review', async () => {
      const reviewed = await businessDraft(owner, business.id);
      await setBasePrice(suadero, 2900);
      const before = await menuOf(branch2);
      const response = await owner
        .send(
          'post',
          `/admin/businesses/${business.id}/publications`,
          { draftVersion: reviewed.draftVersion },
          idempotencyHeader(),
        )
        .expect(409);
      expect(response.body.code).toBe('DRAFT_CHANGED');
      expect((await menuOf(branch2)).version).toBe(before.version);
    });

    it('refuses a branch publication of a draft that changed after the review', async () => {
      const reviewed = await branchDraft(branchAdmin, branch1);
      await adjust(pastor, { priceCents: null, available: false });
      const response = await branchAdmin
        .send(
          'post',
          `/admin/branches/${branch1}/publications`,
          { draftVersion: reviewed.draftVersion },
          idempotencyHeader(),
        )
        .expect(409);
      expect(response.body.code).toBe('DRAFT_CHANGED');
    });
  });

  describe('idempotency (design: flujo publicar, paso 2)', () => {
    it('returns the original publication to a retry with the same key, and publishes once', async () => {
      const key = `retry-${unique('key')}`;
      const before = await menuOf(branch2);
      const first = await publishBusiness(owner, business.id, key);
      const retry = await publishBusiness(owner, business.id, key);
      expect(first.status).toBe(201);
      expect(retry.status).toBe(201);
      expect(retry.body).toEqual(first.body);
      expect(await publicationsWith(key)).toBe(1);
      expect((await menuOf(branch2)).version).toBe(before.version + 1);
    });

    it('publishes once when a double click sends the same key at the same time', async () => {
      const key = `double-${unique('key')}`;
      const draft = await businessDraft(owner, business.id);
      const send = () =>
        owner.send(
          'post',
          `/admin/businesses/${business.id}/publications`,
          { draftVersion: draft.draftVersion, confirmedConflicts: [] },
          idempotencyHeader(key),
        );
      const [a, b] = await Promise.all([send(), send()]);
      expect([a.status, b.status]).toEqual([201, 201]);
      expect(a.body.id).toBe(b.body.id);
      expect(await publicationsWith(key)).toBe(1);
    });

    it('refuses the same key for a different request', async () => {
      const key = `reused-${unique('key')}`;
      expect((await publishBusiness(owner, business.id, key)).status).toBe(201);
      const response = await owner
        .send(
          'post',
          `/admin/businesses/${business.id}/publications`,
          { draftVersion: 999 },
          idempotencyHeader(key),
        )
        .expect(422);
      expect(response.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
    });

    it('keeps branch keys apart from business keys', async () => {
      const key = `shared-${unique('key')}`;
      expect((await publishBusiness(owner, business.id, key)).status).toBe(201);
      const response = await publishBranch(branchAdmin, branch1, key);
      expect(response.status).toBe(201);
      expect(response.body.scope).toBe('branch');
    });
  });

  describe('conflicts with branch adjustments (ADR-0036)', () => {
    it('lists a branch price that a base price change would overwrite, and refuses to publish it unconfirmed', async () => {
      await adjust(pastor, { priceCents: 2000, available: false });
      expect((await publishBranch(branchAdmin, branch1)).status).toBe(201);
      await setBasePrice(pastor, 3000);

      const draft = await businessDraft(owner, business.id);
      expect(draft.conflicts).toEqual([
        { branchId: branch1, dishId: pastor, reason: 'price_changed' },
      ]);
      const before = await menuOf(branch1);
      const response = await owner
        .send(
          'post',
          `/admin/businesses/${business.id}/publications`,
          { draftVersion: draft.draftVersion, confirmedConflicts: [] },
          idempotencyHeader(),
        )
        .expect(409);
      expect(response.body.code).toBe('PUBLICATION_CONFLICTS');
      expect(await menuOf(branch1)).toEqual(before);
      expect(dishIn(before, pastor)?.priceCents).toBe(2000);
    });

    it('overwrites the confirmed branch price in its draft and its published menu, keeping the rest', async () => {
      const branchBefore = await branchDraft(branchAdmin, branch1);
      expect((await publishBusiness(owner, business.id)).status).toBe(201);

      const menu = await menuOf(branch1);
      expect(dishIn(menu, pastor)).toEqual(
        expect.objectContaining({ priceCents: 3000, available: false }),
      );
      expect(dishIn(await menuOf(branch2), pastor)?.priceCents).toBe(3000);

      const branchAfter = await branchDraft(branchAdmin, branch1);
      expect(branchAfter.overrides).toEqual([
        { dishId: pastor, priceCents: null, available: false, hidden: false },
      ]);
      expect(branchAfter.draftVersion).toBe(branchBefore.draftVersion + 1);
      expect(branchAfter.publishedVersion).toBe(
        (branchBefore.publishedVersion ?? 0) + 1,
      );
      expect((await businessDraft(owner, business.id)).conflicts).toEqual([]);
    });

    it('refuses a confirmation that misses a conflict that appeared after the review', async () => {
      await setBasePrice(suadero, 3100);
      const reviewed = await businessDraft(owner, business.id);
      expect(reviewed.conflicts).toEqual([]);
      await adjust(suadero, { priceCents: 2700 });
      expect((await publishBranch(branchAdmin, branch1)).status).toBe(201);

      const response = await owner
        .send(
          'post',
          `/admin/businesses/${business.id}/publications`,
          { draftVersion: reviewed.draftVersion, confirmedConflicts: [] },
          idempotencyHeader(),
        )
        .expect(409);
      expect(response.body.code).toBe('PUBLICATION_CONFLICTS');
      expect((await publishBusiness(owner, business.id)).status).toBe(201);
    });

    it('lists the adjustments of a removed dish and drops them once confirmed', async () => {
      await adjust(suadero, { priceCents: null, hidden: true });
      expect((await publishBranch(branchAdmin, branch1)).status).toBe(201);
      await owner
        .send('delete', `/admin/businesses/${business.id}/dishes/${suadero}`)
        .expect(204);

      const draft = await businessDraft(owner, business.id);
      expect(draft.dishes.map((d) => d.id)).not.toContain(suadero);
      expect(draft.conflicts).toEqual([
        { branchId: branch1, dishId: suadero, reason: 'dish_removed' },
      ]);
      expect((await publishBusiness(owner, business.id)).status).toBe(201);

      const branchAfter = await branchDraft(branchAdmin, branch1);
      expect(branchAfter.overrides.map((o) => o.dishId)).not.toContain(suadero);
      for (const branchId of [branch1, branch2]) {
        expect(dishIn(await menuOf(branchId), suadero)).toBeUndefined();
      }
      await branchAdmin
        .send('put', `/admin/branches/${branch1}/overrides/${suadero}`, {
          priceCents: null,
          available: true,
          hidden: false,
        })
        .expect(404);
    });
  });

  describe('concurrent publications (design: flujo publicar, paso 6)', () => {
    it('keeps both changes when the business and a branch publish at the same time', async () => {
      await owner
        .send('patch', `/admin/businesses/${business.id}/dishes/${pastor}`, {
          name: 'Pastor de trompo',
        })
        .expect(200);
      await adjust(pastor, { priceCents: null, available: true });

      const [base, branch] = await Promise.all([
        publishBusiness(owner, business.id),
        publishBranch(branchAdmin, branch1),
      ]);
      expect([base.status, branch.status]).toEqual([201, 201]);

      const latest = await menuOf(branch1);
      expect(latest.version).toBe(
        Math.max(
          ...[base, branch].flatMap((r) =>
            (r.body as { menus: { branchId: string; version: number }[] }).menus
              .filter((m) => m.branchId === branch1)
              .map((m) => m.version),
          ),
        ),
      );
      expect(dishIn(latest, pastor)).toEqual(
        expect.objectContaining({ name: 'Pastor de trompo', available: true }),
      );
    });
  });
});
