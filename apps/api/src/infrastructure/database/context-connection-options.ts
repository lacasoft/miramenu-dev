import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import type { DatabaseConfig } from '../config/environment';
import type { DatabaseContext } from './database-contexts';

/**
 * One connection per bounded context, logged in as that context's role (ADR-0027).
 * Postgres itself rejects any query to another context's schema, and the search_path
 * makes unqualified SQL resolve inside the context's own schema.
 */
export function contextConnectionOptions(
  database: DatabaseConfig,
  context: DatabaseContext,
): TypeOrmModuleOptions {
  const { user, password } = database.contexts[context];
  return {
    type: 'postgres',
    name: context,
    host: database.host,
    port: database.port,
    database: database.name,
    username: user,
    password,
    schema: context,
    applicationName: `miramenu-api:${context}`,
    autoLoadEntities: true,
    synchronize: false,
    migrationsRun: false,
    retryAttempts: 3,
    retryDelay: 1000,
    extra: {
      max: database.poolMaxPerContext,
      options: `-c search_path=${context}`,
    },
  };
}
