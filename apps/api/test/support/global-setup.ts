// Jest global setup: brings the test database to the latest migration before any test runs.
import { createMigratorDataSource } from '../../src/cli/migrator.data-source';
import { useTestDatabase } from './test-database';

export default async function globalSetup(): Promise<void> {
  const env = { ...process.env };
  useTestDatabase(env);
  const dataSource = createMigratorDataSource(env);
  await dataSource.initialize();
  try {
    await dataSource.runMigrations();
  } finally {
    await dataSource.destroy();
  }
}
