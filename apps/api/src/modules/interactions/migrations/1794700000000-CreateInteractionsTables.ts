import type { MigrationInterface, QueryRunner } from 'typeorm';
import { parseDatabaseEnvironment } from '../../../infrastructure/config/environment';
import { quoteIdentifier } from '../../../infrastructure/database/sql';

/**
 * Interactions: likes and comments of a dish in a branch (ADR-0040). Branches, dishes,
 * diners and devices belong to other contexts, whose schemas Interactions cannot read
 * (ADR-0027), so their ids are plain columns checked through their contracts.
 */
export class CreateInteractionsTables1794700000000 implements MigrationInterface {
  name = 'CreateInteractionsTables1794700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const role = quoteIdentifier(
      parseDatabaseEnvironment(process.env).contexts.interactions.user,
    );
    const statements = [
      // Design key: (branch, dish, diner or device). A registered diner's like keeps the
      // device it came from; an anonymous one has only the device.
      `CREATE TABLE interactions.dish_like (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id uuid NOT NULL,
        dish_id uuid NOT NULL,
        diner_id uuid,
        device_id uuid,
        created_at timestamptz(3) NOT NULL DEFAULT now(),
        CONSTRAINT ck_dish_like_owner CHECK (diner_id IS NOT NULL OR device_id IS NOT NULL)
      )`,
      `CREATE UNIQUE INDEX uq_dish_like_diner ON interactions.dish_like (branch_id, dish_id, diner_id)
        WHERE diner_id IS NOT NULL`,
      `CREATE UNIQUE INDEX uq_dish_like_device ON interactions.dish_like (branch_id, dish_id, device_id)
        WHERE diner_id IS NULL`,
      `CREATE INDEX idx_dish_like_anonymous_device ON interactions.dish_like (device_id)
        WHERE diner_id IS NULL`,

      // Pre-moderated (ADR-0008): born pending; only approved ones are seen and counted.
      `CREATE TABLE interactions.comment (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id uuid NOT NULL,
        dish_id uuid NOT NULL,
        diner_id uuid NOT NULL,
        client_id uuid NOT NULL,
        text text NOT NULL CHECK (length(text) BETWEEN 1 AND 280),
        status text NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'approved', 'rejected', 'deleted')),
        version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
        submitted_at timestamptz(3) NOT NULL,
        approved_at timestamptz(3),
        moderated_at timestamptz(3),
        moderated_by uuid,
        created_at timestamptz(3) NOT NULL DEFAULT now(),
        updated_at timestamptz(3) NOT NULL DEFAULT now(),
        CONSTRAINT uq_comment_client UNIQUE (diner_id, client_id),
        CONSTRAINT ck_comment_approved CHECK ((status = 'approved') = (approved_at IS NOT NULL))
      )`,
      `CREATE INDEX idx_comment_approved ON interactions.comment (branch_id, dish_id, approved_at DESC, id DESC)
        WHERE status = 'approved'`,
      `CREATE INDEX idx_comment_pending ON interactions.comment (branch_id, submitted_at, id)
        WHERE status = 'pending'`,
      `CREATE INDEX idx_comment_diner ON interactions.comment (diner_id, created_at DESC, id DESC)
        WHERE status <> 'deleted'`,

      // How far the DinerRegistered notices of Diners have been processed (ADR-0039).
      `CREATE TABLE interactions.registration_cursor (
        id boolean PRIMARY KEY DEFAULT true CHECK (id),
        position bigint NOT NULL DEFAULT 0 CHECK (position >= 0),
        updated_at timestamptz(3) NOT NULL DEFAULT now()
      )`,
      `INSERT INTO interactions.registration_cursor DEFAULT VALUES`,
      // Only its one row is ever moved forward.
      `REVOKE INSERT, DELETE ON interactions.registration_cursor FROM ${role}`,

      // Design: "Interacciones anota qué dispositivos ya pasó". One row per notice, so a
      // notice can never be applied twice.
      `CREATE TABLE interactions.transferred_device (
        position bigint PRIMARY KEY,
        device_id uuid NOT NULL,
        diner_id uuid NOT NULL,
        moved_likes integer NOT NULL CHECK (moved_likes >= 0),
        merged_likes integer NOT NULL CHECK (merged_likes >= 0),
        transferred_at timestamptz(3) NOT NULL
      )`,
    ];
    for (const statement of statements) {
      await queryRunner.query(statement);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      'transferred_device',
      'registration_cursor',
      'comment',
      'dish_like',
    ]) {
      await queryRunner.query(`DROP TABLE interactions.${table}`);
    }
  }
}
