import { DataSource } from 'typeorm';
import { parseDatabaseEnvironment } from '../infrastructure/config/environment';
import { MIGRATIONS } from './migrations';

/**
 * The owner of the schemas: the only role allowed to run DDL. Used by the migration CLI,
 * the superadmin seed and the e2e setup; the API never connects with it.
 */
export function createMigratorDataSource(
  env: Readonly<Record<string, string | undefined>>,
): DataSource {
  const database = parseDatabaseEnvironment(env);
  return new DataSource({
    type: 'postgres',
    host: database.host,
    port: database.port,
    database: database.name,
    username: database.migrator.user,
    password: database.migrator.password,
    applicationName: 'miramenu-migrator',
    migrationsTableName: 'typeorm_migrations',
    migrationsTransactionMode: 'each',
    migrations: MIGRATIONS,
  });
}

/** Default export for the TypeORM CLI (`npm run db:migrate`). */
export default createMigratorDataSource(process.env);
