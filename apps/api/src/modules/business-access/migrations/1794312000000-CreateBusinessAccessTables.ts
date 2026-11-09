import type { MigrationInterface, QueryRunner } from 'typeorm';
import { parseDatabaseEnvironment } from '../../../infrastructure/config/environment';
import { quoteIdentifier } from '../../../infrastructure/database/sql';

/**
 * Business & access: businesses, branches, their public identifiers and the admins.
 * Some invariants live in the database itself, so no bug in the API can break them:
 * QR codes, subdomains and slugs are never reassigned, and the API role can never
 * create or promote a superadmin (RNF-08); only the seed, as the owner, can.
 */
export class CreateBusinessAccessTables1794312000000 implements MigrationInterface {
  name = 'CreateBusinessAccessTables1794312000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const role = quoteIdentifier(
      parseDatabaseEnvironment(process.env).contexts.business_access.user,
    );
    const statements = [
      `CREATE TABLE business_access.business (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
        country char(2) NOT NULL CHECK (country ~ '^[A-Z]{2}$'),
        created_at timestamptz(3) NOT NULL DEFAULT now(),
        updated_at timestamptz(3) NOT NULL DEFAULT now()
      )`,
      `CREATE INDEX idx_business_listing ON business_access.business (created_at DESC, id DESC)`,

      `CREATE TABLE business_access.branch (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        business_id uuid NOT NULL REFERENCES business_access.business (id),
        name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
        created_at timestamptz(3) NOT NULL DEFAULT now(),
        updated_at timestamptz(3) NOT NULL DEFAULT now(),
        CONSTRAINT uq_branch_id_business UNIQUE (id, business_id)
      )`,
      `CREATE INDEX idx_branch_listing ON business_access.branch (business_id, created_at DESC, id DESC)`,

      `CREATE TABLE business_access.branch_slug (
        business_id uuid NOT NULL,
        slug text NOT NULL CHECK (slug ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'),
        branch_id uuid NOT NULL,
        is_current boolean NOT NULL,
        created_at timestamptz(3) NOT NULL DEFAULT now(),
        CONSTRAINT pk_branch_slug PRIMARY KEY (business_id, slug),
        CONSTRAINT fk_branch_slug_branch FOREIGN KEY (branch_id, business_id)
          REFERENCES business_access.branch (id, business_id)
      )`,
      `CREATE UNIQUE INDEX uq_branch_slug_current ON business_access.branch_slug (branch_id) WHERE is_current`,

      `CREATE TABLE business_access.subdomain (
        name text NOT NULL CHECK (name ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'),
        business_id uuid NOT NULL REFERENCES business_access.business (id),
        branch_id uuid,
        is_current boolean NOT NULL,
        created_at timestamptz(3) NOT NULL DEFAULT now(),
        CONSTRAINT pk_subdomain PRIMARY KEY (name),
        CONSTRAINT fk_subdomain_branch FOREIGN KEY (branch_id, business_id)
          REFERENCES business_access.branch (id, business_id)
      )`,
      `CREATE UNIQUE INDEX uq_subdomain_current_business ON business_access.subdomain (business_id)
        WHERE is_current AND branch_id IS NULL`,
      `CREATE UNIQUE INDEX uq_subdomain_current_branch ON business_access.subdomain (branch_id)
        WHERE is_current AND branch_id IS NOT NULL`,

      `CREATE TABLE business_access.qr_link (
        code text NOT NULL CHECK (code ~ '^[23456789abcdefghjkmnpqrstuvwxyz]{7}$'),
        branch_id uuid NOT NULL REFERENCES business_access.branch (id),
        created_at timestamptz(3) NOT NULL DEFAULT now(),
        CONSTRAINT pk_qr_link PRIMARY KEY (code),
        CONSTRAINT uq_qr_link_branch UNIQUE (branch_id)
      )`,

      `CREATE TABLE business_access.admin_user (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text NOT NULL CHECK (email = lower(email) AND length(email) <= 254 AND position('@' in email) > 1),
        name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
        password_hash text,
        is_superadmin boolean NOT NULL DEFAULT false,
        created_at timestamptz(3) NOT NULL DEFAULT now(),
        updated_at timestamptz(3) NOT NULL DEFAULT now(),
        CONSTRAINT uq_admin_user_email UNIQUE (email)
      )`,
      // RNF-08: there can only ever be one superadmin.
      `CREATE UNIQUE INDEX uq_admin_user_single_superadmin ON business_access.admin_user ((true)) WHERE is_superadmin`,

      `CREATE TABLE business_access.role_assignment (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES business_access.admin_user (id),
        business_id uuid NOT NULL REFERENCES business_access.business (id),
        branch_id uuid,
        role text NOT NULL CHECK (role IN ('business_admin', 'branch_admin')),
        created_at timestamptz(3) NOT NULL DEFAULT now(),
        CONSTRAINT ck_role_assignment_scope CHECK ((role = 'branch_admin') = (branch_id IS NOT NULL)),
        CONSTRAINT fk_role_assignment_branch FOREIGN KEY (branch_id, business_id)
          REFERENCES business_access.branch (id, business_id),
        CONSTRAINT uq_role_assignment UNIQUE NULLS NOT DISTINCT (user_id, business_id, branch_id, role)
      )`,
      `CREATE INDEX idx_role_assignment_business ON business_access.role_assignment (business_id, user_id)`,

      `CREATE TABLE business_access.admin_invitation (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES business_access.admin_user (id),
        token_hash bytea NOT NULL,
        invited_by uuid REFERENCES business_access.admin_user (id),
        expires_at timestamptz(3) NOT NULL,
        used_at timestamptz(3),
        revoked_at timestamptz(3),
        created_at timestamptz(3) NOT NULL DEFAULT now(),
        CONSTRAINT uq_admin_invitation_token UNIQUE (token_hash)
      )`,
      `CREATE INDEX idx_admin_invitation_pending ON business_access.admin_invitation (user_id)
        WHERE used_at IS NULL AND revoked_at IS NULL`,

      `CREATE TABLE business_access.admin_session (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES business_access.admin_user (id),
        token_hash bytea NOT NULL,
        created_at timestamptz(3) NOT NULL DEFAULT now(),
        last_seen_at timestamptz(3) NOT NULL,
        expires_at timestamptz(3) NOT NULL,
        revoked_at timestamptz(3),
        CONSTRAINT uq_admin_session_token UNIQUE (token_hash)
      )`,
      `CREATE INDEX idx_admin_session_user ON business_access.admin_session (user_id)`,

      // Identifiers are never reassigned (ADR-0010, ADR-0018, ADR-0029): the API may only
      // move the "current" flag, never rewrite or delete a QR, subdomain or slug.
      `REVOKE UPDATE, DELETE ON business_access.subdomain, business_access.branch_slug, business_access.qr_link FROM ${role}`,
      `GRANT UPDATE (is_current) ON business_access.subdomain, business_access.branch_slug TO ${role}`,
      // RNF-08: the API role cannot set is_superadmin, neither on insert nor on update.
      `REVOKE INSERT, UPDATE ON business_access.admin_user FROM ${role}`,
      `GRANT INSERT (id, email, name, password_hash, created_at, updated_at) ON business_access.admin_user TO ${role}`,
      `GRANT UPDATE (name, password_hash, updated_at) ON business_access.admin_user TO ${role}`,
    ];
    for (const statement of statements) {
      await queryRunner.query(statement);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      'admin_session',
      'admin_invitation',
      'role_assignment',
      'admin_user',
      'qr_link',
      'subdomain',
      'branch_slug',
      'branch',
      'business',
    ]) {
      await queryRunner.query(`DROP TABLE business_access.${table}`);
    }
  }
}
