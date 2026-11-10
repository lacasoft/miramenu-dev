import type { INestApplication } from '@nestjs/common';
import { errorResponseSchema, sessionActorSchema } from '@miramenu/contracts';
import request from 'supertest';
import type { App } from 'supertest/types';
import { hashSecretToken } from '../src/infrastructure/security/secret-token';
import {
  ADMIN_ORIGIN,
  ADMIN_PASSWORD,
  type AdminClient,
  asOwner,
  clientIp,
  ensureSuperadmin,
  invitationTokenFor,
  login,
  SUPERADMIN,
  unique,
} from './support/admin-fixtures';
import { createTestApp } from './support/test-app';

describe('Admin authentication (e2e)', () => {
  let app: INestApplication<App>;
  let superadmin: AdminClient;
  const ip = clientIp();

  const post = (path: string, body: object, from = ip) =>
    request(app.getHttpServer())
      .post(path)
      .set('Origin', ADMIN_ORIGIN)
      .set('X-Forwarded-For', from)
      .send(body);

  /** A new business admin, invited by the superadmin and not yet active. */
  async function invite(): Promise<{
    email: string;
    userId: string;
    sentAt: number;
  }> {
    const email = `${unique('invited')}@example.test`;
    const sentAt = Date.now() - 1000;
    const response = await superadmin
      .send('post', '/admin/businesses', {
        name: 'Invited business',
        country: 'MX',
        subdomain: unique('inv'),
        admin: { email, name: 'Invited' },
      })
      .expect(201);
    expect(response.body.invitation).toEqual({ sent: true });
    return { email, userId: response.body.admin.id as string, sentAt };
  }

  beforeAll(async () => {
    app = await createTestApp();
    await ensureSuperadmin();
    superadmin = await login(app, SUPERADMIN.email, SUPERADMIN.password, ip);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('invitation (ADR-0023, ADR-0033)', () => {
    it('lets a new admin set a password once, from the emailed link, and then sign in', async () => {
      const { email, sentAt } = await invite();
      const token = await invitationTokenFor(email, sentAt);

      await post('/admin/invitations/accept', {
        token,
        password: ADMIN_PASSWORD,
      }).expect(204);
      const reused = await post('/admin/invitations/accept', {
        token,
        password: ADMIN_PASSWORD,
      }).expect(404);
      expect(errorResponseSchema.parse(reused.body).code).toBe(
        'INVITATION_NOT_FOUND',
      );

      const admin = await login(app, email, ADMIN_PASSWORD, ip);
      const session = await admin.send('get', '/admin/session').expect(200);
      expect(sessionActorSchema.parse(session.body)).toMatchObject({
        user: { email },
        isSuperadmin: false,
      });
    });

    it('refuses a password shorter than 12 characters (ADR-0034)', async () => {
      const { email, sentAt } = await invite();
      const token = await invitationTokenFor(email, sentAt);

      const response = await post('/admin/invitations/accept', {
        token,
        password: 'example-shr',
      }).expect(400);
      expect(response.body.code).toBe('VALIDATION_FAILED');
    });

    it('rejects an expired invitation with 410', async () => {
      const { email, userId, sentAt } = await invite();
      const token = await invitationTokenFor(email, sentAt);
      await asOwner((client) =>
        client.query(
          `UPDATE business_access.admin_invitation SET expires_at = now() - interval '1 minute' WHERE user_id = $1`,
          [userId],
        ),
      );

      const response = await post('/admin/invitations/accept', {
        token,
        password: ADMIN_PASSWORD,
      }).expect(410);
      expect(response.body.code).toBe('INVITATION_EXPIRED');
    });

    it('invalidates the previous link when the invitation is resent', async () => {
      const { email, userId, sentAt } = await invite();
      const first = await invitationTokenFor(email, sentAt);
      const [{ business_id: businessId }] = await asOwner(
        async (client) =>
          (
            await client.query<{ business_id: string }>(
              `SELECT business_id FROM business_access.role_assignment WHERE user_id = $1`,
              [userId],
            )
          ).rows,
      );

      const resentAt = Date.now() - 500;
      await superadmin
        .send(
          'post',
          `/admin/businesses/${businessId}/users/${userId}/invitation`,
        )
        .expect(200, { sent: true });
      let second = await invitationTokenFor(email, resentAt);
      if (second === first)
        second = await invitationTokenFor(email, Date.now() - 200);

      await post('/admin/invitations/accept', {
        token: first,
        password: ADMIN_PASSWORD,
      }).expect(404);
      await post('/admin/invitations/accept', {
        token: second,
        password: ADMIN_PASSWORD,
      }).expect(204);
    });
  });

  describe('login (ADR-0021)', () => {
    it('gives the same answer for an unknown email, a wrong password and a pending invitation', async () => {
      const { email: pending } = await invite();
      const attempts = [
        { email: `${unique('nobody')}@example.test`, password: ADMIN_PASSWORD },
        { email: SUPERADMIN.email, password: 'example-wrong-password' },
        { email: pending, password: ADMIN_PASSWORD },
      ];
      for (const attempt of attempts) {
        const response = await post(
          '/admin/session',
          attempt,
          clientIp(),
        ).expect(401);
        expect(response.body).toMatchObject({
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        });
      }
    });

    it('makes the caller wait, with Retry-After, from the fifth failure, without locking the account', async () => {
      const email = `${unique('target')}@example.test`;
      const attackerIp = clientIp();
      for (let failure = 1; failure <= 5; failure += 1) {
        await post(
          '/admin/session',
          { email, password: 'example-guess-0000' },
          attackerIp,
        ).expect(401);
      }
      const blocked = await post(
        '/admin/session',
        { email, password: 'example-guess-0000' },
        attackerIp,
      ).expect(429);
      expect(blocked.body.code).toBe('TOO_MANY_REQUESTS');
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThanOrEqual(1);

      // The superadmin, from another IP and email, is not affected.
      await login(app, SUPERADMIN.email, SUPERADMIN.password, clientIp());
    });

    it('closes the login when Redis is unreachable (fails closed)', async () => {
      const broken = await createTestApp({
        configure: (config) => ({
          ...config,
          redis: { ...config.redis, port: 1 },
        }),
      });
      try {
        const response = await request(broken.getHttpServer())
          .post('/admin/session')
          .set('Origin', ADMIN_ORIGIN)
          .send({ email: SUPERADMIN.email, password: SUPERADMIN.password })
          .expect(503);
        expect(response.body.code).toBe('LOGIN_UNAVAILABLE');
      } finally {
        await broken.close();
      }
    });
  });

  describe('CSRF (ADR-0035)', () => {
    it('refuses admin writes without the admin app Origin, login included', async () => {
      const body = { email: SUPERADMIN.email, password: SUPERADMIN.password };
      const missing = await request(app.getHttpServer())
        .post('/admin/session')
        .send(body)
        .expect(403);
      expect(missing.body.code).toBe('ORIGIN_NOT_ALLOWED');

      await request(app.getHttpServer())
        .post('/admin/businesses')
        .set('Cookie', superadmin.cookieHeader)
        .set('Origin', 'https://evil.example')
        .send({})
        .expect(403);
    });

    it('lets reads through without Origin', async () => {
      await request(app.getHttpServer())
        .get('/admin/session')
        .set('Cookie', superadmin.cookieHeader)
        .expect(200);
    });
  });

  describe('session (ADR-0028, ADR-0035)', () => {
    it('sets a __Host- cookie that is HttpOnly, Secure and SameSite=Strict', async () => {
      const response = await post('/admin/session', SUPERADMIN).expect(204);
      const cookie = (response.headers['set-cookie'] as unknown as string[])[0];
      expect(cookie).toMatch(
        /^__Host-miramenu_admin=[A-Za-z0-9_-]{43}; Path=\/; Expires=/,
      );
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Secure');
      expect(cookie).toContain('SameSite=Strict');
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('requires a session on admin routes', async () => {
      const response = await request(app.getHttpServer())
        .get('/admin/session')
        .expect(401);
      expect(response.body.code).toBe('UNAUTHENTICATED');
    });

    it('revokes the session on logout', async () => {
      const admin = await login(app, SUPERADMIN.email, SUPERADMIN.password, ip);
      await admin.send('delete', '/admin/session').expect(204);
      await admin.send('get', '/admin/session').expect(401);
    });

    it('ends a session idle for more than an hour', async () => {
      const admin = await login(app, SUPERADMIN.email, SUPERADMIN.password, ip);
      const token = admin.cookieHeader.split('=')[1];
      await asOwner((client) =>
        client.query(
          `UPDATE business_access.admin_session SET last_seen_at = now() - interval '61 minutes' WHERE token_hash = $1`,
          [hashSecretToken(token)],
        ),
      );
      await admin.send('get', '/admin/session').expect(401);
    });
  });
});
