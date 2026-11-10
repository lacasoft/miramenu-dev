import type { MigrationInterface, QueryRunner } from 'typeorm';
import { parseDatabaseEnvironment } from '../../../infrastructure/config/environment';
import { quoteIdentifier } from '../../../infrastructure/database/sql';

/**
 * Catalog: drafts of the base menu and of each branch, what each one published, and the
 * combined menu diners read (ADR-0003, ADR-0036). Business and branch ids come from
 * Business & access, whose schema Catalog cannot read (ADR-0027), so they anchor on the
 * state rows here; every other key includes business_id, so nothing points to another
 * business (ADR-0019). Published versions are fixed: the API role can add them, never
 * change or delete them.
 */
export class CreateCatalogTables1794400000000 implements MigrationInterface {
  name = 'CreateCatalogTables1794400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const role = quoteIdentifier(
      parseDatabaseEnvironment(process.env).contexts.catalog.user,
    );
    const name = (column: string) =>
      `${column} text NOT NULL CHECK (length(${column}) BETWEEN 1 AND 120)`;
    const price = (column: string, nullable: boolean) =>
      `${column} integer ${nullable ? '' : 'NOT NULL'} CHECK (${column} BETWEEN 0 AND 10000000)`;
    const position = `position integer NOT NULL CHECK (position BETWEEN 0 AND 10000)`;
    const version = (column: string, nullable: boolean) =>
      `${column} integer ${nullable ? '' : 'NOT NULL'} CHECK (${column} >= 1)`;

    const statements = [
      // One row per business and per branch: draft version, published versions, and the
      // row each publication locks.
      `CREATE TABLE catalog.business_state (
        business_id uuid PRIMARY KEY,
        draft_version integer NOT NULL DEFAULT 0 CHECK (draft_version >= 0),
        ${version('published_version', true)},
        created_at timestamptz(3) NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE catalog.branch_state (
        branch_id uuid PRIMARY KEY,
        business_id uuid NOT NULL REFERENCES catalog.business_state (business_id),
        draft_version integer NOT NULL DEFAULT 0 CHECK (draft_version >= 0),
        ${version('published_version', true)},
        ${version('menu_version', true)},
        created_at timestamptz(3) NOT NULL DEFAULT now(),
        CONSTRAINT uq_branch_state_business UNIQUE (branch_id, business_id)
      )`,
      `CREATE INDEX idx_branch_state_business ON catalog.branch_state (business_id)`,

      // Base entities are removed softly: a branch may still adjust a removed dish until
      // the business publishes and confirms the overwrite.
      `CREATE TABLE catalog.category (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        business_id uuid NOT NULL REFERENCES catalog.business_state (business_id),
        ${name('name')},
        ${position},
        removed_at timestamptz(3),
        created_at timestamptz(3) NOT NULL DEFAULT now(),
        updated_at timestamptz(3) NOT NULL DEFAULT now(),
        CONSTRAINT uq_category_id_business UNIQUE (id, business_id)
      )`,
      `CREATE INDEX idx_category_business ON catalog.category (business_id) WHERE removed_at IS NULL`,

      `CREATE TABLE catalog.dish (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        business_id uuid NOT NULL REFERENCES catalog.business_state (business_id),
        branch_id uuid,
        category_id uuid NOT NULL,
        ${name('name')},
        description text NOT NULL CHECK (length(description) <= 500),
        ${price('price_cents', false)},
        currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
        ${position},
        available boolean NOT NULL DEFAULT true,
        removed_at timestamptz(3),
        created_at timestamptz(3) NOT NULL DEFAULT now(),
        updated_at timestamptz(3) NOT NULL DEFAULT now(),
        CONSTRAINT uq_dish_id_business UNIQUE (id, business_id),
        CONSTRAINT fk_dish_category FOREIGN KEY (category_id, business_id)
          REFERENCES catalog.category (id, business_id),
        CONSTRAINT fk_dish_branch FOREIGN KEY (branch_id, business_id)
          REFERENCES catalog.branch_state (branch_id, business_id),
        -- A base dish is always available; each branch adjusts it with an override.
        CONSTRAINT ck_dish_base_available CHECK (branch_id IS NOT NULL OR available),
        -- Nobody adjusts a branch's own dish, so it is deleted outright.
        CONSTRAINT ck_dish_removed_base_only CHECK (removed_at IS NULL OR branch_id IS NULL)
      )`,
      `CREATE INDEX idx_dish_business ON catalog.dish (business_id) WHERE branch_id IS NULL`,
      `CREATE INDEX idx_dish_branch ON catalog.dish (branch_id) WHERE branch_id IS NOT NULL`,
      `CREATE INDEX idx_dish_category ON catalog.dish (category_id)`,

      `CREATE TABLE catalog.branch_override (
        branch_id uuid NOT NULL,
        dish_id uuid NOT NULL,
        business_id uuid NOT NULL,
        ${price('price_cents', true)},
        available boolean NOT NULL,
        hidden boolean NOT NULL,
        updated_at timestamptz(3) NOT NULL DEFAULT now(),
        CONSTRAINT pk_branch_override PRIMARY KEY (branch_id, dish_id),
        CONSTRAINT fk_branch_override_branch FOREIGN KEY (branch_id, business_id)
          REFERENCES catalog.branch_state (branch_id, business_id),
        CONSTRAINT fk_branch_override_dish FOREIGN KEY (dish_id, business_id)
          REFERENCES catalog.dish (id, business_id)
      )`,
      `CREATE INDEX idx_branch_override_business ON catalog.branch_override (business_id, dish_id)`,

      // The business's profile has no branch; a branch's own profile replaces it.
      `CREATE TABLE catalog.profile (
        business_id uuid NOT NULL REFERENCES catalog.business_state (business_id),
        branch_id uuid,
        ${name('name')},
        social_links jsonb NOT NULL CHECK (jsonb_typeof(social_links) = 'array'),
        updated_at timestamptz(3) NOT NULL DEFAULT now(),
        CONSTRAINT uq_profile UNIQUE NULLS NOT DISTINCT (business_id, branch_id),
        CONSTRAINT fk_profile_branch FOREIGN KEY (branch_id, business_id)
          REFERENCES catalog.branch_state (branch_id, business_id)
      )`,

      // A publication remembers its idempotency key and its result (design: flujo publicar).
      `CREATE TABLE catalog.publication (
        id uuid PRIMARY KEY,
        scope text NOT NULL CHECK (scope IN ('business', 'branch')),
        scope_id uuid NOT NULL,
        idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9_-]{16,128}$'),
        request_fingerprint text NOT NULL,
        result jsonb NOT NULL,
        published_by uuid NOT NULL,
        created_at timestamptz(3) NOT NULL DEFAULT now(),
        CONSTRAINT uq_publication_key UNIQUE (scope, scope_id, idempotency_key)
      )`,

      `CREATE TABLE catalog.published_base (
        business_id uuid NOT NULL REFERENCES catalog.business_state (business_id),
        ${version('version', false)},
        content jsonb NOT NULL,
        publication_id uuid NOT NULL REFERENCES catalog.publication (id),
        published_at timestamptz(3) NOT NULL DEFAULT now(),
        CONSTRAINT pk_published_base PRIMARY KEY (business_id, version)
      )`,
      `CREATE TABLE catalog.published_branch (
        branch_id uuid NOT NULL,
        business_id uuid NOT NULL,
        ${version('version', false)},
        content jsonb NOT NULL,
        publication_id uuid NOT NULL REFERENCES catalog.publication (id),
        published_at timestamptz(3) NOT NULL DEFAULT now(),
        CONSTRAINT pk_published_branch PRIMARY KEY (branch_id, version),
        CONSTRAINT fk_published_branch_branch FOREIGN KEY (branch_id, business_id)
          REFERENCES catalog.branch_state (branch_id, business_id)
      )`,
      `CREATE TABLE catalog.published_menu (
        branch_id uuid NOT NULL,
        business_id uuid NOT NULL,
        ${version('version', false)},
        ${version('base_version', false)},
        ${version('branch_version', true)},
        origin text NOT NULL CHECK (origin IN ('publication', 'media_ready')),
        content jsonb NOT NULL,
        publication_id uuid REFERENCES catalog.publication (id),
        published_at timestamptz(3) NOT NULL DEFAULT now(),
        CONSTRAINT pk_published_menu PRIMARY KEY (branch_id, version),
        CONSTRAINT fk_published_menu_branch FOREIGN KEY (branch_id, business_id)
          REFERENCES catalog.branch_state (branch_id, business_id),
        CONSTRAINT fk_published_menu_base FOREIGN KEY (business_id, base_version)
          REFERENCES catalog.published_base (business_id, version),
        CONSTRAINT fk_published_menu_branch_version FOREIGN KEY (branch_id, branch_version)
          REFERENCES catalog.published_branch (branch_id, version),
        CONSTRAINT ck_published_menu_origin CHECK ((origin = 'publication') = (publication_id IS NOT NULL))
      )`,

      // Each published version is fixed (design: "Cada versión es fija").
      `REVOKE UPDATE, DELETE ON catalog.publication, catalog.published_base,
        catalog.published_branch, catalog.published_menu FROM ${role}`,
    ];
    for (const statement of statements) {
      await queryRunner.query(statement);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      'published_menu',
      'published_branch',
      'published_base',
      'publication',
      'profile',
      'branch_override',
      'dish',
      'category',
      'branch_state',
      'business_state',
    ]) {
      await queryRunner.query(`DROP TABLE catalog.${table}`);
    }
  }
}
