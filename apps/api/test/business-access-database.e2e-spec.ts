import { Client } from 'pg';
import { parseDatabaseEnvironment } from '../src/infrastructure/config/environment';
import { asOwner, ensureSuperadmin, unique } from './support/admin-fixtures';

// Postgres SQLSTATEs: insufficient privilege and unique violation.
const PERMISSION_DENIED = '42501';
const UNIQUE_VIOLATION = '23505';

async function sqlStateOf(
  query: Promise<unknown>,
): Promise<string | undefined> {
  try {
    await query;
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

/** The role the API connects with for Business & access. */
async function asApiRole<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const database = parseDatabaseEnvironment(process.env);
  const client = new Client({
    host: database.host,
    port: database.port,
    database: database.name,
    user: database.contexts.business_access.user,
    password: database.contexts.business_access.password,
  });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

describe('Business & access invariants enforced by Postgres (integration)', () => {
  beforeAll(async () => {
    await ensureSuperadmin();
  });

  it('refuses a second superadmin, even to the schema owner (RNF-08)', async () => {
    const state = await asOwner((client) =>
      sqlStateOf(
        client.query(
          `INSERT INTO business_access.admin_user (email, name, is_superadmin) VALUES ($1, 'Second', true)`,
          [`${unique('second')}@example.test`],
        ),
      ),
    );
    expect(state).toBe(UNIQUE_VIOLATION);
  });

  it('never lets the API role create or promote a superadmin (RNF-08)', async () => {
    await asApiRole(async (client) => {
      await expect(
        sqlStateOf(
          client.query(
            `INSERT INTO business_access.admin_user (email, name, is_superadmin) VALUES ($1, 'Rogue', true)`,
            [`${unique('rogue')}@example.test`],
          ),
        ),
      ).resolves.toBe(PERMISSION_DENIED);
      await expect(
        sqlStateOf(
          client.query(
            `UPDATE business_access.admin_user SET is_superadmin = true WHERE false`,
          ),
        ),
      ).resolves.toBe(PERMISSION_DENIED);
    });
  });

  it('never lets the API role rewrite or delete a QR, a subdomain or a slug', async () => {
    await asApiRole(async (client) => {
      for (const statement of [
        `UPDATE business_access.qr_link SET branch_id = branch_id WHERE false`,
        `DELETE FROM business_access.qr_link WHERE false`,
        `UPDATE business_access.subdomain SET business_id = business_id WHERE false`,
        `DELETE FROM business_access.subdomain WHERE false`,
        `UPDATE business_access.branch_slug SET branch_id = branch_id WHERE false`,
        `DELETE FROM business_access.branch_slug WHERE false`,
      ]) {
        await expect(sqlStateOf(client.query(statement))).resolves.toBe(
          PERMISSION_DENIED,
        );
      }
      // Only the "current" flag can move.
      await expect(
        sqlStateOf(
          client.query(
            `UPDATE business_access.subdomain SET is_current = is_current WHERE false`,
          ),
        ),
      ).resolves.toBeUndefined();
    });
  });
});
