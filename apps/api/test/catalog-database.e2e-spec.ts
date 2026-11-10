import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { parseDatabaseEnvironment } from '../src/infrastructure/config/environment';
import { asOwner } from './support/admin-fixtures';

// Postgres SQLSTATEs: insufficient privilege and foreign key violation.
const PERMISSION_DENIED = '42501';
const FOREIGN_KEY_VIOLATION = '23503';

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

/** The role the API connects with for Catalog. */
async function asCatalogRole<T>(
  work: (client: Client) => Promise<T>,
): Promise<T> {
  const database = parseDatabaseEnvironment(process.env);
  const client = new Client({
    host: database.host,
    port: database.port,
    database: database.name,
    user: database.contexts.catalog.user,
    password: database.contexts.catalog.password,
  });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

describe('Catalog invariants enforced by Postgres (integration)', () => {
  const businessX = randomUUID();
  const businessY = randomUUID();
  const branchOfY = randomUUID();
  let categoryOfX: string;
  let dishOfX: string;

  beforeAll(async () => {
    await asOwner(async (client) => {
      await client.query(
        `INSERT INTO catalog.business_state (business_id) VALUES ($1), ($2)`,
        [businessX, businessY],
      );
      await client.query(
        `INSERT INTO catalog.branch_state (branch_id, business_id) VALUES ($1, $2)`,
        [branchOfY, businessY],
      );
      categoryOfX = (
        await client.query<{ id: string }>(
          `INSERT INTO catalog.category (business_id, name, position) VALUES ($1, 'Tacos', 0) RETURNING id`,
          [businessX],
        )
      ).rows[0].id;
      dishOfX = (
        await client.query<{ id: string }>(
          `INSERT INTO catalog.dish (business_id, category_id, name, description, price_cents, currency, position)
           VALUES ($1, $2, 'Pastor', '', 2500, 'MXN', 0) RETURNING id`,
          [businessX, categoryOfX],
        )
      ).rows[0].id;
    });
  });

  it('never lets a branch adjust a dish of another business (ADR-0019)', async () => {
    const state = await asCatalogRole((client) =>
      sqlStateOf(
        client.query(
          `INSERT INTO catalog.branch_override (branch_id, dish_id, business_id, price_cents, available, hidden)
           VALUES ($1, $2, $3, 1, true, false)`,
          [branchOfY, dishOfX, businessY],
        ),
      ),
    );
    expect(state).toBe(FOREIGN_KEY_VIOLATION);
  });

  it('never puts a dish in a category of another business (ADR-0019)', async () => {
    const state = await asCatalogRole((client) =>
      sqlStateOf(
        client.query(
          `INSERT INTO catalog.dish (business_id, category_id, name, description, price_cents, currency, position)
           VALUES ($1, $2, 'Stolen', '', 1, 'MXN', 0)`,
          [businessY, categoryOfX],
        ),
      ),
    );
    expect(state).toBe(FOREIGN_KEY_VIOLATION);
  });

  it.each([
    ['publication', 'created_at'],
    ['published_base', 'published_at'],
    ['published_branch', 'published_at'],
    ['published_menu', 'published_at'],
  ])(
    'never lets the API role change or delete a %s row: each version is fixed',
    async (table, column) => {
      await asCatalogRole(async (client) => {
        await expect(
          sqlStateOf(
            client.query(`UPDATE catalog.${table} SET ${column} = now()`),
          ),
        ).resolves.toBe(PERMISSION_DENIED);
        await expect(
          sqlStateOf(client.query(`DELETE FROM catalog.${table}`)),
        ).resolves.toBe(PERMISSION_DENIED);
      });
    },
  );

  it('lets the API role add a publication and read it back', async () => {
    const id = randomUUID();
    await asCatalogRole(async (client) => {
      await client.query(
        `INSERT INTO catalog.publication
           (id, scope, scope_id, idempotency_key, request_fingerprint, result, published_by)
         VALUES ($1, 'business', $2, $3, 'fingerprint', '{}'::jsonb, $4)`,
        [id, businessX, `key-${randomUUID()}`, randomUUID()],
      );
      const read = await client.query(
        `SELECT 1 FROM catalog.publication WHERE id = $1`,
        [id],
      );
      expect(read.rowCount).toBe(1);
    });
  });
});
