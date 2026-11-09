import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { parseDatabaseEnvironment } from '../config/environment';

const database = parseDatabaseEnvironment(process.env);

/**
 * Used only by the migration CLI (`npm run db:migrate`). It logs in as the owner of the
 * schemas, the only role allowed to run DDL; the API never connects with it.
 */
export default new DataSource({
  type: 'postgres',
  host: database.host,
  port: database.port,
  database: database.name,
  username: database.migrator.user,
  password: database.migrator.password,
  applicationName: 'miramenu-migrator',
  migrationsTableName: 'typeorm_migrations',
  migrationsTransactionMode: 'each',
  migrations: [
    join(__dirname, 'migrations', '*.js'),
    join(__dirname, '..', '..', 'modules', '*', 'migrations', '*.js'),
  ],
});
