import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import {
  type Credentials,
  parseDatabaseEnvironment,
} from '../src/infrastructure/config/environment';
import {
  DATABASE_CONTEXTS,
  type DatabaseContext,
} from '../src/infrastructure/database/database-contexts';
import { quoteIdentifier } from '../src/infrastructure/database/sql';

// Postgres SQLSTATE for "insufficient privilege".
const PERMISSION_DENIED = '42501';

const database = parseDatabaseEnvironment(process.env);
const probe = `isolation_probe_${randomBytes(4).toString('hex')}`;
const tableIn = (context: DatabaseContext) =>
  `${quoteIdentifier(context)}.${quoteIdentifier(probe)}`;

async function connect(credentials: Credentials): Promise<Client> {
  const client = new Client({
    host: database.host,
    port: database.port,
    database: database.name,
    user: credentials.user,
    password: credentials.password,
  });
  await client.connect();
  return client;
}

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

const otherContextPairs = DATABASE_CONTEXTS.flatMap((own) =>
  DATABASE_CONTEXTS.filter((other) => other !== own).map(
    (other) => [own, other] as const,
  ),
);

describe('Postgres isolation between contexts, ADR-0027 (integration)', () => {
  let migrator: Client;
  const clients = new Map<DatabaseContext, Client>();
  const clientFor = (context: DatabaseContext): Client => {
    const client = clients.get(context);
    if (!client) throw new Error(`no connection for ${context}`);
    return client;
  };

  beforeAll(async () => {
    migrator = await connect(database.migrator);
    for (const context of DATABASE_CONTEXTS) {
      await migrator.query(`CREATE TABLE ${tableIn(context)} (id integer)`);
      clients.set(context, await connect(database.contexts[context]));
    }
  });

  afterAll(async () => {
    await Promise.all([...clients.values()].map((client) => client.end()));
    for (const context of DATABASE_CONTEXTS) {
      await migrator.query(`DROP TABLE IF EXISTS ${tableIn(context)}`);
    }
    await migrator.end();
  });

  it.each(DATABASE_CONTEXTS)(
    'lets the %s role read and write its own schema',
    async (context) => {
      const client = clientFor(context);
      await client.query(`INSERT INTO ${tableIn(context)} (id) VALUES (1)`);
      const result = await client.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM ${tableIn(context)}`,
      );
      expect(result.rows[0].total).toBe(1);
    },
  );

  // ADR-0041: Measurement is append-only, so no table created in its schema, partitions
  // included, lets its role change or delete rows; the other contexts may.
  it.each(DATABASE_CONTEXTS)(
    'gives the %s role UPDATE and DELETE on a new table, unless it is Measurement',
    async (context) => {
      const client = clientFor(context);
      const expected =
        context === 'measurement' ? PERMISSION_DENIED : undefined;
      await expect(
        sqlStateOf(client.query(`UPDATE ${tableIn(context)} SET id = 2`)),
      ).resolves.toBe(expected);
      await expect(
        sqlStateOf(client.query(`DELETE FROM ${tableIn(context)}`)),
      ).resolves.toBe(expected);
    },
  );

  it.each(otherContextPairs)(
    'denies the %s role any read or write in the %s schema',
    async (own, other) => {
      const client = clientFor(own);
      await expect(
        sqlStateOf(client.query(`SELECT 1 FROM ${tableIn(other)}`)),
      ).resolves.toBe(PERMISSION_DENIED);
      await expect(
        sqlStateOf(
          client.query(`INSERT INTO ${tableIn(other)} (id) VALUES (1)`),
        ),
      ).resolves.toBe(PERMISSION_DENIED);
    },
  );

  it.each(DATABASE_CONTEXTS)(
    'denies the %s role any DDL, even in its own schema',
    async (context) => {
      const client = clientFor(context);
      await expect(
        sqlStateOf(
          client.query(
            `CREATE TABLE ${quoteIdentifier(context)}.not_allowed (id integer)`,
          ),
        ),
      ).resolves.toBe(PERMISSION_DENIED);
      await expect(
        sqlStateOf(client.query(`DROP TABLE ${tableIn(context)}`)),
      ).resolves.toBe(PERMISSION_DENIED);
    },
  );
});
