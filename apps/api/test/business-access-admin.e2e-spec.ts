import type { INestApplication } from '@nestjs/common';
import {
  branchPageSchema,
  branchSchema,
  businessPageSchema,
  businessUserSchema,
  qrLinkSchema,
  resolutionSchema,
} from '@miramenu/contracts';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  activateAdmin,
  type AdminClient,
  type BusinessFixture,
  clientIp,
  createBranch,
  createBusiness,
  ensureSuperadmin,
  login,
  SUPERADMIN,
  ADMIN_PASSWORD,
  unique,
} from './support/admin-fixtures';
import { createTestApp } from './support/test-app';

describe('Businesses, branches, QR and team (e2e)', () => {
  let app: INestApplication<App>;
  let superadmin: AdminClient;
  let business: BusinessFixture;
  let owner: AdminClient;
  const ip = clientIp();

  beforeAll(async () => {
    app = await createTestApp();
    await ensureSuperadmin();
    superadmin = await login(app, SUPERADMIN.email, SUPERADMIN.password, ip);
    business = await createBusiness(superadmin);
    owner = await login(app, business.adminEmail, ADMIN_PASSWORD, ip);
  });

  afterAll(async () => {
    await app.close();
  });

  const publicGet = (path: string) => request(app.getHttpServer()).get(path);

  describe('businesses (ADR-0020)', () => {
    it('lets only the superadmin register a business', async () => {
      const response = await owner
        .send('post', '/admin/businesses', {
          name: 'Not allowed',
          country: 'MX',
          subdomain: unique('nope'),
          admin: { email: `${unique('x')}@example.test`, name: 'X' },
        })
        .expect(403);
      expect(response.body.code).toBe('FORBIDDEN');
    });

    it('refuses a subdomain that is already taken, by anyone', async () => {
      const response = await superadmin
        .send('post', '/admin/businesses', {
          name: 'Duplicate',
          country: 'MX',
          subdomain: business.subdomain,
          admin: { email: `${unique('dup')}@example.test`, name: 'Dup' },
        })
        .expect(409);
      expect(response.body.code).toBe('SUBDOMAIN_TAKEN');
    });

    it('lists only the businesses where the admin has a role', async () => {
      const response = await owner.send('get', '/admin/businesses').expect(200);
      const page = businessPageSchema.parse(response.body);
      expect(page.items.map((item) => item.id)).toEqual([business.id]);
    });

    it('pages with a cursor', async () => {
      const first = businessPageSchema.parse(
        (await superadmin.send('get', '/admin/businesses?limit=1').expect(200))
          .body,
      );
      expect(first.items).toHaveLength(1);
      expect(first.nextCursor).not.toBeNull();
      const second = businessPageSchema.parse(
        (
          await superadmin
            .send('get', `/admin/businesses?limit=1&cursor=${first.nextCursor}`)
            .expect(200)
        ).body,
      );
      expect(second.items[0].id).not.toBe(first.items[0].id);
    });
  });

  describe('branches and QR (ADR-0010, ADR-0018, ADR-0029, ADR-0032)', () => {
    it('gives every new branch its QR, which redirects to the branch without browser cache', async () => {
      const branch = await createBranch(owner, business.id);
      const qr = qrLinkSchema.parse(
        (await owner.send('get', `/admin/branches/${branch.id}/qr`).expect(200))
          .body,
      );

      const redirect = await publicGet(`/q/${qr.code}`).expect(302);
      expect(redirect.headers['cache-control']).toBe('no-store');
      expect(
        new URL(redirect.headers.location).hostname.startsWith(
          `${business.subdomain}.`,
        ),
      ).toBe(true);
      expect(new URL(redirect.headers.location).pathname).toBe(
        `/${branch.slug}`,
      );
    });

    it('follows a subdomain change, and keeps the old subdomain as an alias', async () => {
      const own = await createBusiness(superadmin);
      const admin = await login(app, own.adminEmail, ADMIN_PASSWORD, ip);
      const branch = await createBranch(admin, own.id);
      const renamed = unique('renamed');

      await admin
        .send('patch', `/admin/businesses/${own.id}`, { subdomain: renamed })
        .expect(200);

      const alias = resolutionSchema.parse(
        (
          await publicGet(
            `/resolve?subdomain=${own.subdomain}&slug=${branch.slug}`,
          ).expect(200)
        ).body,
      );
      expect(alias.branchId).toBe(branch.id);
      expect(
        new URL(alias.canonicalUrl).hostname.startsWith(`${renamed}.`),
      ).toBe(true);

      // The old subdomain can never go to another business.
      await superadmin
        .send('post', '/admin/businesses', {
          name: 'Squatter',
          country: 'MX',
          subdomain: own.subdomain,
          admin: { email: `${unique('sq')}@example.test`, name: 'Sq' },
        })
        .expect(409);
    });

    it('serves a branch with its own subdomain at the root of that subdomain', async () => {
      const branch = await createBranch(owner, business.id);
      const own = unique('own');
      const updated = branchSchema.parse(
        (
          await owner
            .send('patch', `/admin/branches/${branch.id}`, { subdomain: own })
            .expect(200)
        ).body,
      );
      expect(new URL(updated.url).hostname.startsWith(`${own}.`)).toBe(true);
      expect(new URL(updated.url).pathname).toBe('/');

      const resolved = resolutionSchema.parse(
        (await publicGet(`/resolve?subdomain=${own}`).expect(200)).body,
      );
      expect(resolved.branchId).toBe(branch.id);
    });

    it('refuses a slug already used in the same business', async () => {
      const branch = await createBranch(owner, business.id);
      const response = await owner
        .send('post', `/admin/businesses/${business.id}/branches`, {
          name: 'Copy',
          slug: branch.slug,
        })
        .expect(409);
      expect(response.body.code).toBe('SLUG_TAKEN');
    });

    it('answers 404 for an unknown or malformed QR code', async () => {
      await publicGet('/q/zzzzzzz').expect(404);
      await publicGet('/q/../../etc').expect(404);
    });
  });

  describe('team and roles (ADR-0020)', () => {
    it('lets a business admin invite a branch admin, who sees only its branch', async () => {
      const [mine, other] = [
        await createBranch(owner, business.id),
        await createBranch(owner, business.id),
      ];
      const email = `${unique('branchadmin')}@example.test`;
      const invited = await owner
        .send('post', `/admin/businesses/${business.id}/users`, {
          email,
          name: 'Branch admin',
          role: { role: 'branch_admin', branchId: mine.id },
        })
        .expect(201);
      expect(invited.body.invitation).toEqual({ sent: true });
      expect(businessUserSchema.parse(invited.body.user).status).toBe(
        'invited',
      );

      await activateAdmin(email);
      const branchAdmin = await login(app, email, ADMIN_PASSWORD, ip);
      const page = branchPageSchema.parse(
        (
          await branchAdmin
            .send('get', `/admin/businesses/${business.id}/branches`)
            .expect(200)
        ).body,
      );
      expect(page.items.map((item) => item.id)).toEqual([mine.id]);

      await branchAdmin.send('get', `/admin/branches/${other.id}`).expect(404);
      await branchAdmin
        .send('patch', `/admin/branches/${mine.id}`, { name: 'Renamed' })
        .expect(403);
      await branchAdmin
        .send('post', `/admin/businesses/${business.id}/users`, {
          email: `${unique('x')}@example.test`,
          name: 'X',
          role: { role: 'business_admin' },
        })
        .expect(403);
    });

    it('refuses a branch of another business in a role', async () => {
      const elsewhere = await createBusiness(superadmin);
      const elsewhereAdmin = await login(
        app,
        elsewhere.adminEmail,
        ADMIN_PASSWORD,
        ip,
      );
      const foreignBranch = await createBranch(elsewhereAdmin, elsewhere.id);

      const response = await owner
        .send('post', `/admin/businesses/${business.id}/users`, {
          email: `${unique('x')}@example.test`,
          name: 'X',
          role: { role: 'branch_admin', branchId: foreignBranch.id },
        })
        .expect(400);
      expect(response.body.code).toBe('BRANCH_NOT_IN_BUSINESS');
    });

    it('has no superadmin role to assign (RNF-08)', async () => {
      const response = await owner
        .send(
          'put',
          `/admin/businesses/${business.id}/users/${business.adminId}/roles`,
          { roles: [{ role: 'superadmin' }] },
        )
        .expect(400);
      expect(response.body.code).toBe('VALIDATION_FAILED');
    });

    it('replaces and removes roles, and the change applies on the next request', async () => {
      const email = `${unique('member')}@example.test`;
      const invited = await owner
        .send('post', `/admin/businesses/${business.id}/users`, {
          email,
          name: 'Member',
          role: { role: 'business_admin' },
        })
        .expect(201);
      const userId = invited.body.user.id as string;
      await activateAdmin(email);
      const member = await login(app, email, ADMIN_PASSWORD, ip);
      await member
        .send('get', `/admin/businesses/${business.id}/users`)
        .expect(200);

      const branch = await createBranch(owner, business.id);
      const updated = businessUserSchema.parse(
        (
          await owner
            .send(
              'put',
              `/admin/businesses/${business.id}/users/${userId}/roles`,
              {
                roles: [{ role: 'branch_admin', branchId: branch.id }],
              },
            )
            .expect(200)
        ).body,
      );
      expect(updated.roles).toEqual([
        { businessId: business.id, branchId: branch.id, role: 'branch_admin' },
      ]);
      await member
        .send('get', `/admin/businesses/${business.id}/users`)
        .expect(403);

      await owner
        .send(
          'delete',
          `/admin/businesses/${business.id}/users/${userId}/roles`,
        )
        .expect(204);
      await member.send('get', `/admin/businesses/${business.id}`).expect(404);
    });

    it('refuses to resend an invitation to an admin who already set a password', async () => {
      const response = await owner
        .send(
          'post',
          `/admin/businesses/${business.id}/users/${business.adminId}/invitation`,
        )
        .expect(409);
      expect(response.body.code).toBe('USER_ALREADY_ACTIVE');
    });
  });
});
