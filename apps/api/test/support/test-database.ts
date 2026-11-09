/**
 * The e2e tests run against DB_TEST_NAME, never against the development database: they
 * create a superadmin, and there can only be one per database (RNF-08).
 */
export function testDatabaseName(env: NodeJS.ProcessEnv = process.env): string {
  const testName = env.DB_TEST_NAME;
  if (!testName) {
    throw new Error(
      'DB_TEST_NAME is missing: run `npm run env:init -- --update`',
    );
  }
  if (testName === env.MIRAMENU_DEVELOPMENT_DB_NAME) {
    throw new Error(
      'DB_TEST_NAME must differ from DB_NAME: tests would write development data',
    );
  }
  return testName;
}

/** Points DB_NAME at the test database, remembering the development one to refuse sharing it. */
export function useTestDatabase(env: NodeJS.ProcessEnv = process.env): void {
  env.MIRAMENU_DEVELOPMENT_DB_NAME ??= env.DB_NAME;
  env.DB_NAME = testDatabaseName(env);
}
