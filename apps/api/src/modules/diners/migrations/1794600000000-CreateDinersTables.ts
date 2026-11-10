import type { MigrationInterface, QueryRunner } from 'typeorm';
import { parseDatabaseEnvironment } from '../../../infrastructure/config/environment';
import { quoteIdentifier } from '../../../infrastructure/database/sql';

/**
 * Diners: the global account of a registered diner (ADR-0007), the devices that passed
 * to it, its consents and its sessions. Codes live in Redis, never here. Each device
 * linked to an account leaves a DinerRegistered notice in the same transaction; notices
 * are append-only, so the API role can add them and never change or delete them.
 */
export class CreateDinersTables1794600000000 implements MigrationInterface {
  name = 'CreateDinersTables1794600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const role = quoteIdentifier(
      parseDatabaseEnvironment(process.env).contexts.diners.user,
    );
    const statements = [
      // One account per phone number, for every business of Miramenu.
      `CREATE TABLE diners.diner (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        phone text NOT NULL CHECK (phone ~ '^\\+[1-9][0-9]{6,14}$'),
        name text NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
        email text CHECK (length(email) BETWEEN 3 AND 254),
        validated_at timestamptz(3) NOT NULL,
        created_at timestamptz(3) NOT NULL DEFAULT now(),
        updated_at timestamptz(3) NOT NULL DEFAULT now(),
        CONSTRAINT uq_diner_phone UNIQUE (phone)
      )`,

      // The id comes from the PWA (IndexedDB). A device is recorded when it gets linked.
      `CREATE TABLE diners.device (
        id uuid PRIMARY KEY,
        diner_id uuid NOT NULL REFERENCES diners.diner (id),
        linked_at timestamptz(3) NOT NULL,
        created_at timestamptz(3) NOT NULL DEFAULT now()
      )`,
      `CREATE INDEX idx_device_diner ON diners.device (diner_id)`,

      // Design key (diner, kind): the latest grant of each kind, with its notice version.
      `CREATE TABLE diners.consent (
        diner_id uuid NOT NULL REFERENCES diners.diner (id),
        kind text NOT NULL CHECK (kind IN ('privacy_notice', 'offers')),
        notice_version text NOT NULL CHECK (length(notice_version) BETWEEN 1 AND 40),
        granted_at timestamptz(3) NOT NULL,
        CONSTRAINT pk_consent PRIMARY KEY (diner_id, kind)
      )`,

      `CREATE TABLE diners.diner_session (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        diner_id uuid NOT NULL REFERENCES diners.diner (id),
        device_id uuid NOT NULL REFERENCES diners.device (id),
        token_hash bytea NOT NULL,
        created_at timestamptz(3) NOT NULL DEFAULT now(),
        expires_at timestamptz(3) NOT NULL,
        revoked_at timestamptz(3),
        CONSTRAINT uq_diner_session_token UNIQUE (token_hash)
      )`,
      `CREATE INDEX idx_diner_session_diner ON diners.diner_session (diner_id)`,

      // The outbox of DinerRegistered (design, step 6). Positions are written under an
      // advisory lock, so they commit in order and a reader never skips one.
      `CREATE TABLE diners.diner_registered (
        position bigserial PRIMARY KEY,
        event_id uuid NOT NULL DEFAULT gen_random_uuid(),
        diner_id uuid NOT NULL REFERENCES diners.diner (id),
        device_id uuid NOT NULL REFERENCES diners.device (id),
        occurred_at timestamptz(3) NOT NULL,
        CONSTRAINT uq_diner_registered_event UNIQUE (event_id)
      )`,
      `REVOKE UPDATE, DELETE ON diners.diner_registered FROM ${role}`,
    ];
    for (const statement of statements) {
      await queryRunner.query(statement);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      'diner_registered',
      'diner_session',
      'consent',
      'device',
      'diner',
    ]) {
      await queryRunner.query(`DROP TABLE diners.${table}`);
    }
  }
}
