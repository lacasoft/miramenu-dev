import { type INestApplication, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import {
  DiscoveryModule,
  DiscoveryService,
  MetadataScanner,
} from '@nestjs/core';
import type { App } from 'supertest/types';
import {
  ADMIN_PASSWORD,
  type AdminClient,
  type BusinessFixture,
  clientIp,
  createBranch,
  createBusiness,
  activateAdmin,
  ensureSuperadmin,
  login,
  SUPERADMIN,
  unique,
} from './support/admin-fixtures';
import {
  createCategory,
  createDish,
  idempotencyHeader,
  PROFILE,
} from './support/catalog-fixtures';
import { createTestApp } from './support/test-app';

/**
 * ADR-0019: every admin route answers 404 to an admin of another business, and every
 * branch route answers 404 to the admin of another branch. The routes are discovered from
 * the running app, so a new admin route that is not in these tables fails the test.
 */

interface Fixture {
  a: BusinessFixture;
  branchA1: string;
  branchA2: string;
  categoryA: string;
  dishA: string;
  /** An own dish of branch A2. */
  ownDishA2: string;
}

type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';

interface ObjectRoute {
  /** Fills the route's params with objects of business A. */
  path: (fixture: Fixture) => string;
  /** A valid body, so the request reaches the permission check instead of failing validation. */
  body?: (fixture: Fixture) => object;
  /** Headers the route requires before it checks permissions. */
  headers?: () => Record<string, string>;
  /** Routes on a single branch, also tried by the admin of a sibling branch. */
  branchScoped?: true;
}

const OBJECT_ROUTES: Record<string, ObjectRoute> = {
  'GET /admin/businesses/:businessId': {
    path: (f) => `/admin/businesses/${f.a.id}`,
  },
  'PATCH /admin/businesses/:businessId': {
    path: (f) => `/admin/businesses/${f.a.id}`,
    body: () => ({ name: 'Hijacked' }),
  },
  'POST /admin/businesses/:businessId/branches': {
    path: (f) => `/admin/businesses/${f.a.id}/branches`,
    body: () => ({ name: 'Intruder', slug: unique('intruder') }),
  },
  'GET /admin/businesses/:businessId/branches': {
    path: (f) => `/admin/businesses/${f.a.id}/branches`,
  },
  'GET /admin/branches/:branchId': {
    path: (f) => `/admin/branches/${f.branchA2}`,
    branchScoped: true,
  },
  'PATCH /admin/branches/:branchId': {
    path: (f) => `/admin/branches/${f.branchA2}`,
    body: () => ({ name: 'Hijacked' }),
    branchScoped: true,
  },
  'GET /admin/branches/:branchId/qr': {
    path: (f) => `/admin/branches/${f.branchA2}/qr`,
    branchScoped: true,
  },
  'GET /admin/businesses/:businessId/users': {
    path: (f) => `/admin/businesses/${f.a.id}/users`,
  },
  'POST /admin/businesses/:businessId/users': {
    path: (f) => `/admin/businesses/${f.a.id}/users`,
    body: () => ({
      email: `${unique('intruder')}@example.test`,
      name: 'Intruder',
      role: { role: 'business_admin' },
    }),
  },
  'PUT /admin/businesses/:businessId/users/:userId/roles': {
    path: (f) => `/admin/businesses/${f.a.id}/users/${f.a.adminId}/roles`,
    body: () => ({ roles: [{ role: 'business_admin' }] }),
  },
  'DELETE /admin/businesses/:businessId/users/:userId/roles': {
    path: (f) => `/admin/businesses/${f.a.id}/users/${f.a.adminId}/roles`,
  },
  'POST /admin/businesses/:businessId/users/:userId/invitation': {
    path: (f) => `/admin/businesses/${f.a.id}/users/${f.a.adminId}/invitation`,
  },
  'GET /admin/businesses/:businessId/menu-draft': {
    path: (f) => `/admin/businesses/${f.a.id}/menu-draft`,
  },
  'PUT /admin/businesses/:businessId/profile': {
    path: (f) => `/admin/businesses/${f.a.id}/profile`,
    body: () => ({ ...PROFILE, name: 'Hijacked' }),
  },
  'POST /admin/businesses/:businessId/categories': {
    path: (f) => `/admin/businesses/${f.a.id}/categories`,
    body: () => ({ name: 'Hijacked' }),
  },
  'PATCH /admin/businesses/:businessId/categories/:categoryId': {
    path: (f) => `/admin/businesses/${f.a.id}/categories/${f.categoryA}`,
    body: () => ({ name: 'Hijacked' }),
  },
  'DELETE /admin/businesses/:businessId/categories/:categoryId': {
    path: (f) => `/admin/businesses/${f.a.id}/categories/${f.categoryA}`,
  },
  'POST /admin/businesses/:businessId/dishes': {
    path: (f) => `/admin/businesses/${f.a.id}/dishes`,
    body: (f) => ({
      categoryId: f.categoryA,
      name: 'Hijacked',
      priceCents: 1,
      currency: 'MXN',
    }),
  },
  'PATCH /admin/businesses/:businessId/dishes/:dishId': {
    path: (f) => `/admin/businesses/${f.a.id}/dishes/${f.dishA}`,
    body: () => ({ name: 'Hijacked' }),
  },
  'DELETE /admin/businesses/:businessId/dishes/:dishId': {
    path: (f) => `/admin/businesses/${f.a.id}/dishes/${f.dishA}`,
  },
  'POST /admin/businesses/:businessId/publications': {
    path: (f) => `/admin/businesses/${f.a.id}/publications`,
    body: () => ({ draftVersion: 0 }),
    headers: () => idempotencyHeader(),
  },
  'GET /admin/branches/:branchId/menu-draft': {
    path: (f) => `/admin/branches/${f.branchA2}/menu-draft`,
    branchScoped: true,
  },
  'PUT /admin/branches/:branchId/overrides/:dishId': {
    path: (f) => `/admin/branches/${f.branchA2}/overrides/${f.dishA}`,
    body: () => ({ priceCents: 1, available: false, hidden: true }),
    branchScoped: true,
  },
  'DELETE /admin/branches/:branchId/overrides/:dishId': {
    path: (f) => `/admin/branches/${f.branchA2}/overrides/${f.dishA}`,
    branchScoped: true,
  },
  'POST /admin/branches/:branchId/dishes': {
    path: (f) => `/admin/branches/${f.branchA2}/dishes`,
    body: (f) => ({
      categoryId: f.categoryA,
      name: 'Hijacked',
      priceCents: 1,
      currency: 'MXN',
    }),
    branchScoped: true,
  },
  'PATCH /admin/branches/:branchId/dishes/:dishId': {
    path: (f) => `/admin/branches/${f.branchA2}/dishes/${f.ownDishA2}`,
    body: () => ({ name: 'Hijacked' }),
    branchScoped: true,
  },
  'DELETE /admin/branches/:branchId/dishes/:dishId': {
    path: (f) => `/admin/branches/${f.branchA2}/dishes/${f.ownDishA2}`,
    branchScoped: true,
  },
  'PUT /admin/branches/:branchId/profile': {
    path: (f) => `/admin/branches/${f.branchA2}/profile`,
    body: () => ({ ...PROFILE, name: 'Hijacked' }),
    branchScoped: true,
  },
  'DELETE /admin/branches/:branchId/profile': {
    path: (f) => `/admin/branches/${f.branchA2}/profile`,
    branchScoped: true,
  },
  'POST /admin/branches/:branchId/publications': {
    path: (f) => `/admin/branches/${f.branchA2}/publications`,
    body: () => ({ draftVersion: 0 }),
    headers: () => idempotencyHeader(),
    branchScoped: true,
  },
};

/** Admin routes without an object of a business, each with the reason. */
const EXEMPT_ROUTES: Record<string, string> = {
  'POST /admin/session': 'opens a session; no object yet',
  'GET /admin/session': "the actor's own session",
  'DELETE /admin/session': "closes the actor's own session",
  'POST /admin/invitations/accept':
    'no session; the secret token is the object',
  'POST /admin/businesses':
    'creates a business; superadmin only, checked below',
  'GET /admin/businesses': "lists only the actor's businesses, checked below",
};

function discoverAdminRoutes(app: INestApplication<App>): string[] {
  const discovery = app.get(DiscoveryService);
  const scanner = new MetadataScanner();
  const join = (...parts: unknown[]) =>
    `/${parts
      .flatMap((part) => (typeof part === 'string' ? [part] : []))
      .map((part) => part.replace(/^\/+|\/+$/g, ''))
      .filter((part) => part.length > 0)
      .join('/')}`;

  return discovery.getControllers().flatMap((wrapper) => {
    const { instance, metatype } = wrapper;
    if (!instance || !metatype) return [];
    const prototype = Object.getPrototypeOf(instance) as Record<
      string,
      unknown
    >;
    const base: unknown = Reflect.getMetadata(PATH_METADATA, metatype);
    return scanner.getAllMethodNames(prototype).flatMap((name) => {
      const handler = prototype[name] as object;
      const path: unknown = Reflect.getMetadata(PATH_METADATA, handler);
      const method: unknown = Reflect.getMetadata(METHOD_METADATA, handler);
      if (path === undefined || typeof method !== 'number') return [];
      const route = `${RequestMethod[method]} ${join(base, path)}`;
      return route.split(' ')[1].startsWith('/admin') ? [route] : [];
    });
  });
}

describe('Isolation of every admin route, ADR-0019 (e2e)', () => {
  let app: INestApplication<App>;
  let fixture: Fixture;
  let outsider: AdminClient;
  let siblingBranchAdmin: AdminClient;
  let ownerA: AdminClient;
  const ip = clientIp();

  beforeAll(async () => {
    app = await createTestApp({ imports: [DiscoveryModule] });
    await ensureSuperadmin();
    const superadmin = await login(
      app,
      SUPERADMIN.email,
      SUPERADMIN.password,
      ip,
    );

    const a = await createBusiness(superadmin);
    const b = await createBusiness(superadmin);
    ownerA = await login(app, a.adminEmail, ADMIN_PASSWORD, ip);
    const branchA1 = (await createBranch(ownerA, a.id)).id;
    const branchA2 = (await createBranch(ownerA, a.id)).id;
    const categoryA = await createCategory(ownerA, a.id);
    const dishA = await createDish(ownerA, a.id, categoryA);
    const ownDish = await ownerA
      .send('post', `/admin/branches/${branchA2}/dishes`, {
        categoryId: categoryA,
        name: 'House special',
        priceCents: 3000,
        currency: 'MXN',
      })
      .expect(201);
    fixture = {
      a,
      branchA1,
      branchA2,
      categoryA,
      dishA,
      ownDishA2: (ownDish.body as { id: string }).id,
    };

    outsider = await login(app, b.adminEmail, ADMIN_PASSWORD, ip);

    const siblingEmail = `${unique('sibling')}@example.test`;
    await ownerA
      .send('post', `/admin/businesses/${a.id}/users`, {
        email: siblingEmail,
        name: 'Sibling',
        role: { role: 'branch_admin', branchId: branchA1 },
      })
      .expect(201);
    await activateAdmin(siblingEmail);
    siblingBranchAdmin = await login(app, siblingEmail, ADMIN_PASSWORD, ip);
  });

  afterAll(async () => {
    await app.close();
  });

  it('covers every admin route the app exposes, and nothing it does not', () => {
    const discovered = discoverAdminRoutes(app).sort();
    const covered = [
      ...Object.keys(OBJECT_ROUTES),
      ...Object.keys(EXEMPT_ROUTES),
    ].sort();
    expect(discovered).toEqual(covered);
  });

  it.each(Object.entries(OBJECT_ROUTES))(
    '%s answers 404 to an admin of another business',
    async (route, spec) => {
      const method = route.split(' ')[0].toLowerCase() as Method;
      const response = await outsider.send(
        method,
        spec.path(fixture),
        spec.body?.(fixture),
        spec.headers?.(),
      );
      expect({ route, status: response.status }).toEqual({
        route,
        status: 404,
      });
    },
  );

  it.each(
    Object.entries(OBJECT_ROUTES).filter(([, spec]) => spec.branchScoped),
  )('%s answers 404 to the admin of a sibling branch', async (route, spec) => {
    const method = route.split(' ')[0].toLowerCase() as Method;
    const response = await siblingBranchAdmin.send(
      method,
      spec.path(fixture),
      spec.body?.(fixture),
      spec.headers?.(),
    );
    expect({ route, status: response.status }).toEqual({ route, status: 404 });
  });

  it('left business A untouched after all those attempts', async () => {
    const business = await ownerA
      .send('get', `/admin/businesses/${fixture.a.id}`)
      .expect(200);
    expect(business.body.name).not.toBe('Hijacked');
    const users = await ownerA
      .send('get', `/admin/businesses/${fixture.a.id}/users`)
      .expect(200);
    expect(
      users.body.items.map((user: { email: string }) => user.email),
    ).toContain(fixture.a.adminEmail);

    const draft = await ownerA
      .send('get', `/admin/businesses/${fixture.a.id}/menu-draft`)
      .expect(200);
    expect(JSON.stringify(draft.body)).not.toContain('Hijacked');
    expect(draft.body.draftVersion).toBe(2);
    expect(draft.body.dishes.map((dish: { id: string }) => dish.id)).toEqual([
      fixture.dishA,
    ]);
    const branchDraft = await ownerA
      .send('get', `/admin/branches/${fixture.branchA2}/menu-draft`)
      .expect(200);
    expect(JSON.stringify(branchDraft.body)).not.toContain('Hijacked');
    expect(branchDraft.body.draftVersion).toBe(1);
    expect(branchDraft.body.overrides).toEqual([]);
  });

  it('does not list business A to an admin of another business', async () => {
    const response = await outsider
      .send('get', '/admin/businesses')
      .expect(200);
    expect(
      response.body.items.map((item: { id: string }) => item.id),
    ).not.toContain(fixture.a.id);
  });
});
