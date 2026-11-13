import type { INestApplication } from '@nestjs/common';
import {
  branchMenuDraftSchema,
  businessMenuDraftSchema,
  publicationSchema,
  publishedMenuSchema,
} from '@miramenu/contracts';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  activateAdmin,
  ADMIN_PASSWORD,
  type AdminClient,
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
  MENU_PROFILE,
  PROFILE,
  publishBranch,
  publishBusiness,
} from './support/catalog-fixtures';
import { createTestApp } from './support/test-app';

describe('Catalog drafts and the published menu (e2e)', () => {
  let app: INestApplication<App>;
  let superadmin: AdminClient;
  let business: BusinessFixture;
  let owner: AdminClient;
  let branchAdmin: AdminClient;
  let branch1: string;
  let branch2: string;
  const ip = clientIp();

  const menuOf = (branchId: string) =>
    request(app.getHttpServer()).get(`/branches/${branchId}/menu`);

  beforeAll(async () => {
    app = await createTestApp();
    await ensureSuperadmin();
    superadmin = await login(app, SUPERADMIN.email, SUPERADMIN.password, ip);
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
  });

  afterAll(async () => {
    await app.close();
  });

  describe('base draft', () => {
    it('starts empty, at draft version 0, and never published', async () => {
      const draft = await businessDraft(owner, business.id);
      expect(businessMenuDraftSchema.parse(draft)).toEqual({
        draftVersion: 0,
        publishedVersion: null,
        profile: null,
        categories: [],
        dishes: [],
        conflicts: [],
        media: [],
      });
    });

    it('bumps the draft version on every change and keeps the changes in the draft', async () => {
      const categoryId = await createCategory(owner, business.id, 'Tacos');
      await createDish(owner, business.id, categoryId, {
        name: 'Pastor',
        priceCents: 2500,
      });
      await owner
        .send('put', `/admin/businesses/${business.id}/profile`, PROFILE)
        .expect(200);
      const draft = await businessDraft(owner, business.id);
      expect(draft.draftVersion).toBe(3);
      expect(draft.profile).toEqual(PROFILE);
      expect(draft.categories).toEqual([
        { id: categoryId, name: 'Tacos', position: 0 },
      ]);
      expect(draft.dishes).toEqual([
        expect.objectContaining({
          categoryId,
          name: 'Pastor',
          priceCents: 2500,
          currency: 'MXN',
          description: '',
          position: 0,
        }),
      ]);
    });

    it('places new categories and dishes after the last ones', async () => {
      const second = await createCategory(owner, business.id, 'Drinks');
      const draft = await businessDraft(owner, business.id);
      expect(draft.categories.find((c) => c.id === second)?.position).toBe(1);
    });

    it('refuses a category of another business in a dish (ADR-0019)', async () => {
      const other = await createBusiness(superadmin);
      const otherOwner = await login(app, other.adminEmail, ADMIN_PASSWORD, ip);
      const foreignCategory = await createCategory(otherOwner, other.id);
      const response = await owner
        .send('post', `/admin/businesses/${business.id}/dishes`, {
          categoryId: foreignCategory,
          name: 'Stolen',
          priceCents: 1,
          currency: 'MXN',
        })
        .expect(404);
      expect(response.body.code).toBe('CATEGORY_NOT_FOUND');
    });

    it('keeps a category with dishes, and removes an empty one', async () => {
      const draft = await businessDraft(owner, business.id);
      const withDishes = draft.dishes[0].categoryId;
      const response = await owner
        .send(
          'delete',
          `/admin/businesses/${business.id}/categories/${withDishes}`,
        )
        .expect(409);
      expect(response.body.code).toBe('CATEGORY_IN_USE');

      const empty = await createCategory(owner, business.id, 'Empty');
      await owner
        .send('delete', `/admin/businesses/${business.id}/categories/${empty}`)
        .expect(204);
      await owner
        .send('delete', `/admin/businesses/${business.id}/categories/${empty}`)
        .expect(404);
    });

    it('answers 404 to the superadmin for a business that does not exist', async () => {
      await superadmin
        .send(
          'post',
          '/admin/businesses/00000000-0000-4000-8000-000000000000/categories',
          { name: 'Ghost' },
        )
        .expect(404);
      await superadmin
        .send(
          'get',
          '/admin/businesses/00000000-0000-4000-8000-000000000000/menu-draft',
        )
        .expect(404);
    });
  });

  describe('roles (ADR-0032)', () => {
    it('lets a branch admin read the base draft, but not change or publish it', async () => {
      await branchAdmin
        .send('get', `/admin/businesses/${business.id}/menu-draft`)
        .expect(200);
      const draft = await businessDraft(owner, business.id);
      await branchAdmin
        .send('post', `/admin/businesses/${business.id}/categories`, {
          name: 'Mine',
        })
        .expect(403);
      await branchAdmin
        .send(
          'patch',
          `/admin/businesses/${business.id}/dishes/${draft.dishes[0].id}`,
          { priceCents: 1 },
        )
        .expect(403);
      await branchAdmin
        .send('put', `/admin/businesses/${business.id}/profile`, PROFILE)
        .expect(403);
      await branchAdmin
        .send(
          'post',
          `/admin/businesses/${business.id}/publications`,
          { draftVersion: draft.draftVersion },
          idempotencyHeader(),
        )
        .expect(403);
    });

    it('lets a branch admin operate its own branch and hides the other one', async () => {
      await branchAdmin
        .send('get', `/admin/branches/${branch1}/menu-draft`)
        .expect(200);
      await branchAdmin
        .send('put', `/admin/branches/${branch2}/profile`, PROFILE)
        .expect(404);
    });

    it('needs a valid Idempotency-Key to publish', async () => {
      const response = await owner
        .send('post', `/admin/businesses/${business.id}/publications`, {
          draftVersion: 0,
        })
        .expect(400);
      expect(response.body.code).toBe('VALIDATION_FAILED');
      expect(response.body.message).toContain('Idempotency-Key');
    });
  });

  describe('publishing and reading (ADR-0003)', () => {
    it('has no menu before the first publication', async () => {
      await menuOf(branch1).expect(404);
      await menuOf('00000000-0000-4000-8000-000000000000').expect(404);
    });

    it('refuses a branch publication before the business published its base menu', async () => {
      const response = await publishBranch(branchAdmin, branch1);
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('BASE_MENU_NOT_PUBLISHED');
    });

    it('needs the business profile before the first publication', async () => {
      const other = await createBusiness(superadmin);
      const otherOwner = await login(app, other.adminEmail, ADMIN_PASSWORD, ip);
      await createBranch(otherOwner, other.id);
      const response = await publishBusiness(otherOwner, other.id);
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('PROFILE_REQUIRED');
    });

    it('publishes one menu per branch, combined and ready to read', async () => {
      const response = await publishBusiness(owner, business.id);
      expect(response.status).toBe(201);
      const publication = publicationSchema.parse(response.body);
      expect(publication.scope).toBe('business');
      expect(publication.version).toBe(1);
      expect(publication.menus.map((m) => m.branchId).sort()).toEqual(
        [branch1, branch2].sort(),
      );

      for (const branchId of [branch1, branch2]) {
        const menu = await menuOf(branchId).expect(200);
        const body = publishedMenuSchema.parse(menu.body);
        expect(body.branchId).toBe(branchId);
        expect(body.version).toBe(1);
        expect(body.profile).toEqual(MENU_PROFILE);
        // The empty "Drinks" category is left out.
        expect(body.categories.map((c) => c.name)).toEqual(['Tacos']);
        expect(body.categories[0].dishes).toEqual([
          expect.objectContaining({
            name: 'Pastor',
            priceCents: 2500,
            available: true,
          }),
        ]);
      }
    });

    it('answers 304 to a client that already has this version', async () => {
      const first = await menuOf(branch1).expect(200);
      expect(first.headers['cache-control']).toBe('public, no-cache');
      const etag = first.headers.etag as string;
      expect(etag).toBe('"menu-v1"');
      await menuOf(branch1).set('If-None-Match', etag).expect(304);
    });

    it('never shows a draft change to diners until it is published', async () => {
      const draft = await businessDraft(owner, business.id);
      await owner
        .send(
          'patch',
          `/admin/businesses/${business.id}/dishes/${draft.dishes[0].id}`,
          { name: 'Pastor (draft)', priceCents: 9900 },
        )
        .expect(200);
      const menu = await menuOf(branch1).expect(200);
      expect(JSON.stringify(menu.body)).not.toContain('(draft)');
      expect(menu.body.categories[0].dishes[0].priceCents).toBe(2500);
    });

    it('serves the new version right after publishing, without waiting for the cache', async () => {
      await menuOf(branch2).expect(200);
      await publishBusiness(owner, business.id).then((r) =>
        expect(r.status).toBe(201),
      );
      const menu = await menuOf(branch2).expect(200);
      expect(menu.body.version).toBe(2);
      expect(menu.body.categories[0].dishes[0].name).toBe('Pastor (draft)');
    });

    it('publishes a branch on top of the published base, without touching the other branch', async () => {
      const draft = await businessDraft(owner, business.id);
      const pastor = draft.dishes[0];
      await branchAdmin
        .send('put', `/admin/branches/${branch1}/overrides/${pastor.id}`, {
          priceCents: 2000,
          available: false,
          hidden: false,
        })
        .expect(200);
      const own = await branchAdmin
        .send('post', `/admin/branches/${branch1}/dishes`, {
          categoryId: pastor.categoryId,
          name: 'Gringa',
          priceCents: 4500,
          currency: 'MXN',
        })
        .expect(201);
      await branchAdmin
        .send('put', `/admin/branches/${branch1}/profile`, {
          name: 'La Fonda Centro',
          socialLinks: [],
        })
        .expect(200);

      const before = (await menuOf(branch2).expect(200)).body.version;
      const response = await publishBranch(branchAdmin, branch1);
      expect(response.status).toBe(201);
      expect(response.body.scope).toBe('branch');

      const menu = publishedMenuSchema.parse(
        (await menuOf(branch1).expect(200)).body,
      );
      expect(menu.profile.name).toBe('La Fonda Centro');
      expect(menu.categories[0].dishes).toEqual([
        expect.objectContaining({
          id: pastor.id,
          priceCents: 2000,
          available: false,
        }),
        expect.objectContaining({ id: own.body.id, name: 'Gringa' }),
      ]);
      expect((await menuOf(branch2).expect(200)).body.version).toBe(before);
    });

    it('builds a branch publication on the published base, never on the base draft', async () => {
      const draft = await businessDraft(owner, business.id);
      await owner
        .send(
          'patch',
          `/admin/businesses/${business.id}/dishes/${draft.dishes[0].id}`,
          { name: 'Pastor (unpublished)' },
        )
        .expect(200);
      await owner
        .send('put', `/admin/businesses/${business.id}/profile`, {
          name: 'Unpublished profile',
          socialLinks: [],
        })
        .expect(200);
      await publishBranch(branchAdmin, branch1).then((r) =>
        expect(r.status).toBe(201),
      );
      const menu = JSON.stringify((await menuOf(branch1).expect(200)).body);
      expect(menu).not.toContain('unpublished');
      expect(menu).not.toContain('Unpublished');
      await owner
        .send('put', `/admin/businesses/${business.id}/profile`, PROFILE)
        .expect(200);
    });

    it('leaves a hidden dish out of the branch menu', async () => {
      const draft = await businessDraft(owner, business.id);
      await branchAdmin
        .send(
          'put',
          `/admin/branches/${branch1}/overrides/${draft.dishes[0].id}`,
          { priceCents: null, available: true, hidden: true },
        )
        .expect(200);
      await publishBranch(branchAdmin, branch1).then((r) =>
        expect(r.status).toBe(201),
      );
      const menu = (await menuOf(branch1).expect(200)).body;
      expect(JSON.stringify(menu)).not.toContain(draft.dishes[0].id);
      expect(
        menu.categories[0].dishes.map((d: { name: string }) => d.name),
      ).toEqual(['Gringa']);
    });

    it('goes back to the business profile when the branch drops its own', async () => {
      await branchAdmin
        .send('delete', `/admin/branches/${branch1}/profile`)
        .expect(204);
      const draft = branchMenuDraftSchema.parse(
        await branchDraft(branchAdmin, branch1),
      );
      expect(draft.profile).toBeNull();
      await publishBranch(branchAdmin, branch1).then((r) =>
        expect(r.status).toBe(201),
      );
      expect((await menuOf(branch1).expect(200)).body.profile).toEqual(
        MENU_PROFILE,
      );
    });

    it('refuses an own dish in a category the business has not published', async () => {
      const unpublished = await createCategory(owner, business.id, 'Specials');
      const own = await branchAdmin
        .send('post', `/admin/branches/${branch1}/dishes`, {
          categoryId: unpublished,
          name: 'Secret',
          priceCents: 100,
          currency: 'MXN',
        })
        .expect(201);
      const response = await publishBranch(branchAdmin, branch1);
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('CATEGORY_NOT_PUBLISHED');
      await branchAdmin
        .send('delete', `/admin/branches/${branch1}/dishes/${own.body.id}`)
        .expect(204);
    });

    it('gives a branch created later its menu at the next publication', async () => {
      const late = (await createBranch(owner, business.id)).id;
      await menuOf(late).expect(404);
      await publishBusiness(owner, business.id).then((r) =>
        expect(r.status).toBe(201),
      );
      expect((await menuOf(late).expect(200)).body.version).toBe(1);
    });
  });
});
