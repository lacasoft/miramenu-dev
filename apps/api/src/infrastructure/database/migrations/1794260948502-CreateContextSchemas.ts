import type { MigrationInterface, QueryRunner } from 'typeorm';
import { parseDatabaseEnvironment } from '../../config/environment';
import { DATABASE_CONTEXTS } from '../database-contexts';
import { quoteIdentifier } from '../sql';

/**
 * One schema per bounded context, owned by the migrator role (ADR-0027). Each context
 * role may only use its own schema, and default privileges give it read and write
 * access, never DDL, to every table and sequence created there later.
 */
export class CreateContextSchemas1794260948502 implements MigrationInterface {
  name = 'CreateContextSchemas1794260948502';

  async up(queryRunner: QueryRunner): Promise<void> {
    const { contexts } = parseDatabaseEnvironment(process.env);
    for (const context of DATABASE_CONTEXTS) {
      const schema = quoteIdentifier(context);
      const role = quoteIdentifier(contexts[context].user);
      await queryRunner.query(`CREATE SCHEMA ${schema}`);
      await queryRunner.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`);
      await queryRunner.query(
        `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${role}`,
      );
      await queryRunner.query(
        `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${role}`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const { contexts } = parseDatabaseEnvironment(process.env);
    for (const context of [...DATABASE_CONTEXTS].reverse()) {
      const schema = quoteIdentifier(context);
      const role = quoteIdentifier(contexts[context].user);
      await queryRunner.query(
        `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} REVOKE USAGE, SELECT, UPDATE ON SEQUENCES FROM ${role}`,
      );
      await queryRunner.query(
        `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM ${role}`,
      );
      await queryRunner.query(`REVOKE USAGE ON SCHEMA ${schema} FROM ${role}`);
      // RESTRICT (the default): fails if later migrations still have tables here.
      await queryRunner.query(`DROP SCHEMA ${schema}`);
    }
  }
}
