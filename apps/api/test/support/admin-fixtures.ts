import { randomBytes } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import type { INestApplication } from '@nestjs/common';
import { Client } from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  parseDatabaseEnvironment,
  parseEnvironment,
} from '../../src/infrastructure/config/environment';
import { hashPassword } from '../../src/modules/business-access/domain/password';

/** Obviously fake credentials for the test database only. */
export const SUPERADMIN = {
  email: 'superadmin@example.test',
  password: 'example-superadmin-passphrase',
};
export const ADMIN_PASSWORD = 'example-admin-passphrase';

const config = parseEnvironment(process.env);
export const ADMIN_ORIGIN = config.adminAppUrl;

/** A unique lowercase suffix, for subdomains, slugs and emails that never collide between runs. */
export const unique = (prefix: string): string =>
  `${prefix}-${randomBytes(4).toString('hex')}`;

/** A client IP of its own for this test file (see createTestApp), from TEST-NET-3. */
export const clientIp = (): string =>
  `203.0.113.${1 + (randomBytes(1)[0] % 254)}`;

/** The schema owner on the test database: sets up what only the seed or a person could. */
export async function asOwner<T>(
  work: (client: Client) => Promise<T>,
): Promise<T> {
  const database = parseDatabaseEnvironment(process.env);
  const client = new Client({
    host: database.host,
    port: database.port,
    database: database.name,
    user: database.migrator.user,
    password: database.migrator.password,
  });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

/** The test database's only superadmin, with a known password. */
export async function ensureSuperadmin(): Promise<void> {
  const passwordHash = await hashPassword(SUPERADMIN.password);
  await asOwner(async (client) => {
    await client.query(
      `INSERT INTO business_access.admin_user (email, name, is_superadmin) VALUES ($1, 'Superadmin', true)
       ON CONFLICT DO NOTHING`,
      [SUPERADMIN.email],
    );
    await client.query(
      `UPDATE business_access.admin_user SET password_hash = $2 WHERE email = $1`,
      [SUPERADMIN.email, passwordHash],
    );
  });
}

/** Shortcut for fixtures: gives an invited admin a password, as accepting the invitation would. */
export async function activateAdmin(
  email: string,
  password = ADMIN_PASSWORD,
): Promise<void> {
  const passwordHash = await hashPassword(password);
  await asOwner((client) =>
    client.query(
      `UPDATE business_access.admin_user SET password_hash = $2 WHERE email = $1`,
      [email, passwordHash],
    ),
  );
}

/** An authenticated admin client: session cookie, the admin app's Origin and the test's IP. */
export class AdminClient {
  constructor(
    private readonly app: INestApplication<App>,
    private readonly cookie: string,
    private readonly ip: string,
  ) {}

  send(
    method: 'get' | 'post' | 'patch' | 'put' | 'delete',
    path: string,
    body?: object,
    headers: Readonly<Record<string, string>> = {},
  ) {
    const call = request(this.app.getHttpServer())
      [method](path)
      .set('Cookie', this.cookie)
      .set('Origin', ADMIN_ORIGIN)
      .set('X-Forwarded-For', this.ip)
      .set(headers);
    return body === undefined ? call : call.send(body);
  }

  get cookieHeader(): string {
    return this.cookie;
  }
}

export async function login(
  app: INestApplication<App>,
  email: string,
  password: string,
  ip: string,
): Promise<AdminClient> {
  const response = await request(app.getHttpServer())
    .post('/admin/session')
    .set('Origin', ADMIN_ORIGIN)
    .set('X-Forwarded-For', ip)
    .send({ email, password })
    .expect(204);
  const setCookie = response.headers['set-cookie'] as unknown as string[];
  return new AdminClient(app, setCookie[0].split(';')[0], ip);
}

export interface BusinessFixture {
  id: string;
  subdomain: string;
  adminEmail: string;
  adminId: string;
}

/** A business created by the superadmin, with its first admin already active. */
export async function createBusiness(
  superadmin: AdminClient,
): Promise<BusinessFixture> {
  const subdomain = unique('biz');
  const adminEmail = `${unique('admin')}@example.test`;
  const response = await superadmin
    .send('post', '/admin/businesses', {
      name: `Business ${subdomain}`,
      country: 'MX',
      subdomain,
      admin: { email: adminEmail, name: 'Admin' },
    })
    .expect(201);
  const body = response.body as {
    business: { id: string };
    admin: { id: string };
  };
  await activateAdmin(adminEmail);
  return {
    id: body.business.id,
    subdomain,
    adminEmail,
    adminId: body.admin.id,
  };
}

export async function createBranch(
  admin: AdminClient,
  businessId: string,
): Promise<{ id: string; slug: string }> {
  const slug = unique('branch');
  const response = await admin
    .send('post', `/admin/businesses/${businessId}/branches`, {
      name: `Branch ${slug}`,
      slug,
    })
    .expect(201);
  return { id: (response.body as { id: string }).id, slug };
}

const mailpit = `http://127.0.0.1:${process.env.MAILPIT_UI_PORT ?? ''}/api/v1`;

/** The token of the latest invitation emailed to this address, read from Mailpit. */
export async function invitationTokenFor(
  email: string,
  notBefore = 0,
): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const search = await fetch(
      `${mailpit}/search?query=${encodeURIComponent(`to:${email}`)}`,
    );
    const { messages } = (await search.json()) as {
      messages: { ID: string; Created: string }[];
    };
    const latest = messages.find(
      (message) => Date.parse(message.Created) >= notBefore,
    );
    if (latest) {
      const message = (await (
        await fetch(`${mailpit}/message/${latest.ID}`)
      ).json()) as { Text: string };
      const token = /#token=([A-Za-z0-9_-]{43})/.exec(message.Text)?.[1];
      if (token) return token;
    }
    await sleep(250);
  }
  throw new Error(`No invitation email for ${email}`);
}
