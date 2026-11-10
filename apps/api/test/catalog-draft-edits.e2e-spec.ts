import type { INestApplication } from '@nestjs/common';
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
  businessDraft,
  createCategory,
  createDish,
} from './support/catalog-fixtures';
import { createTestApp } from './support/test-app';

describe('Catalog draft edits (e2e)', () => {
  let app: INestApplication<App>;
  let business: BusinessFixture;
  let owner: AdminClient;
  let branchAdmin: AdminClient;
  let branch1: string;
  const ip = clientIp();

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
    await createDish(
      owner,
      business.id,
      await createCategory(owner, business.id, 'Tacos'),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  // UPDATE and DELETE ... RETURNING once read their rows wrongly: a PATCH answered without
  // its fields and a missing object never got its 404.
  describe('edits answer with what they changed', () => {
    const missing = '00000000-0000-4000-8000-000000000000';

    it('returns the edited category and dish, and 404 for one that is not there', async () => {
      const categoryId = await createCategory(owner, business.id, 'Postres');
      const category = await owner
        .send(
          'patch',
          `/admin/businesses/${business.id}/categories/${categoryId}`,
          { name: 'Dulces', position: 7 },
        )
        .expect(200);
      expect(category.body).toEqual({
        id: categoryId,
        name: 'Dulces',
        position: 7,
      });
      const dishId = await createDish(owner, business.id, categoryId, {
        name: 'Flan',
      });
      const dish = await owner
        .send('patch', `/admin/businesses/${business.id}/dishes/${dishId}`, {
          priceCents: 4200,
        })
        .expect(200);
      expect(dish.body).toMatchObject({
        id: dishId,
        name: 'Flan',
        priceCents: 4200,
      });

      await owner
        .send(
          'patch',
          `/admin/businesses/${business.id}/categories/${missing}`,
          {
            name: 'Ghost',
          },
        )
        .expect(404);
      await owner
        .send('patch', `/admin/businesses/${business.id}/dishes/${missing}`, {
          name: 'Ghost',
        })
        .expect(404);
      await owner
        .send('delete', `/admin/businesses/${business.id}/dishes/${dishId}`)
        .expect(204);
      await owner
        .send('delete', `/admin/businesses/${business.id}/dishes/${dishId}`)
        .expect(404);
    });

    it("returns a branch's edited own dish, and 404 for an adjustment or dish already gone", async () => {
      const draft = await businessDraft(owner, business.id);
      const own = await branchAdmin
        .send('post', `/admin/branches/${branch1}/dishes`, {
          categoryId: draft.categories[0].id,
          name: 'Gringa',
          priceCents: 4500,
          currency: 'MXN',
        })
        .expect(201);
      const edited = await branchAdmin
        .send('patch', `/admin/branches/${branch1}/dishes/${own.body.id}`, {
          available: false,
        })
        .expect(200);
      expect(edited.body).toMatchObject({ id: own.body.id, available: false });
      for (let time = 0; time < 2; time += 1) {
        await branchAdmin
          .send('delete', `/admin/branches/${branch1}/dishes/${own.body.id}`)
          .expect(time === 0 ? 204 : 404);
      }

      const dishId = draft.dishes[0].id;
      await branchAdmin
        .send('put', `/admin/branches/${branch1}/overrides/${dishId}`, {
          priceCents: null,
          available: false,
          hidden: false,
        })
        .expect(200);
      for (let time = 0; time < 2; time += 1) {
        await branchAdmin
          .send('delete', `/admin/branches/${branch1}/overrides/${dishId}`)
          .expect(time === 0 ? 204 : 404);
      }
    });
  });
});
