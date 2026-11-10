import type { MigrationInterface, QueryRunner } from 'typeorm';
import { parseDatabaseEnvironment } from '../../../infrastructure/config/environment';
import { quoteIdentifier } from '../../../infrastructure/database/sql';

/**
 * Measurement (ADR-0041): one row per closed feed entry, partitioned by UTC day so the
 * 90-day retention drops whole days (ADR-0005, ADR-0014), and the hourly aggregate the
 * dashboard reads, kept forever. Branches and dishes belong to other contexts, whose
 * schemas Measurement cannot read (ADR-0027), so their ids are plain columns.
 *
 * The API role cannot create or drop tables. Partitions are kept by one function that
 * runs as the schema owner, takes no arguments and only does that, so calling it can
 * never drop recent data.
 */
export class CreateMeasurementTables1794800000000 implements MigrationInterface {
  name = 'CreateMeasurementTables1794800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const role = quoteIdentifier(
      parseDatabaseEnvironment(process.env).contexts.measurement.user,
    );
    const statements = [
      // Append-only: no table created from now on in this schema, partitions included,
      // gives the API role UPDATE or DELETE; only the aggregate gets UPDATE below.
      `ALTER DEFAULT PRIVILEGES IN SCHEMA measurement REVOKE UPDATE, DELETE ON TABLES FROM ${role}`,

      // The partition key must be in the primary key; a resent entry keeps its enteredAt.
      `CREATE TABLE measurement.feed_entry (
        entry_id uuid NOT NULL,
        entered_at timestamptz(3) NOT NULL,
        device_id uuid NOT NULL,
        branch_id uuid NOT NULL,
        dish_id uuid NOT NULL,
        exposure_ms integer NOT NULL CHECK (exposure_ms BETWEEN 0 AND 600000),
        valid_view boolean NOT NULL,
        exit text NOT NULL CHECK (exit IN ('manual', 'auto', 'abandoned')),
        quick_skip boolean NOT NULL,
        received_at timestamptz(3) NOT NULL,
        CONSTRAINT pk_feed_entry PRIMARY KEY (entered_at, entry_id),
        CONSTRAINT ck_feed_entry_view CHECK (NOT valid_view OR exposure_ms >= 1000),
        -- design: a quick skip is only a manual one; auto and abandoned never are.
        CONSTRAINT ck_feed_entry_quick_skip
          CHECK (quick_skip = (exit = 'manual' AND exposure_ms < 2000))
      ) PARTITION BY RANGE (entered_at)`,
      `CREATE INDEX idx_feed_entry_branch ON measurement.feed_entry (branch_id, entered_at)`,

      `CREATE TABLE measurement.hourly_aggregate (
        branch_id uuid NOT NULL,
        dish_id uuid NOT NULL,
        hour timestamptz NOT NULL CHECK (extract(epoch FROM hour)::bigint % 3600 = 0),
        entries integer NOT NULL CHECK (entries >= 0),
        views integer NOT NULL CHECK (views BETWEEN 0 AND entries),
        exposure_ms bigint NOT NULL CHECK (exposure_ms >= 0),
        quick_skips integer NOT NULL CHECK (quick_skips BETWEEN 0 AND entries),
        CONSTRAINT pk_hourly_aggregate PRIMARY KEY (branch_id, dish_id, hour)
      )`,
      `CREATE INDEX idx_hourly_aggregate_period ON measurement.hourly_aggregate (branch_id, hour)`,
      `GRANT UPDATE ON measurement.hourly_aggregate TO ${role}`,

      // The past 7 days, for late entries (design: hasta 7 días), and the next 7 ahead,
      // so a stopped worker has a week before entries fail; days older than 90 go.
      `CREATE FUNCTION measurement.maintain_feed_entry_partitions() RETURNS void
        LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
        AS $maintain$
        DECLARE
          today date := (now() AT TIME ZONE 'UTC')::date;
          day date;
          stale record;
        BEGIN
          -- Several workers may call it at once; they take turns.
          PERFORM pg_advisory_xact_lock(4800000001);
          FOR day IN SELECT d::date FROM generate_series(today - 7, today + 7, interval '1 day') AS d LOOP
            EXECUTE format(
              'CREATE TABLE IF NOT EXISTS measurement.%I PARTITION OF measurement.feed_entry FOR VALUES FROM (%L) TO (%L)',
              'feed_entry_p' || to_char(day, 'YYYYMMDD'),
              day::timestamp AT TIME ZONE 'UTC',
              (day + 1)::timestamp AT TIME ZONE 'UTC'
            );
          END LOOP;
          FOR stale IN
            SELECT child.relname FROM pg_inherits inheritance
            JOIN pg_class child ON child.oid = inheritance.inhrelid
            JOIN pg_class parent ON parent.oid = inheritance.inhparent
            JOIN pg_namespace schema ON schema.oid = parent.relnamespace
            WHERE schema.nspname = 'measurement' AND parent.relname = 'feed_entry'
              AND child.relname ~ '^feed_entry_p[0-9]{8}$'
              AND to_date(substring(child.relname FROM 13), 'YYYYMMDD') < today - 90
          LOOP
            EXECUTE format('DROP TABLE measurement.%I', stale.relname);
          END LOOP;
        END;
        $maintain$`,
      `REVOKE ALL ON FUNCTION measurement.maintain_feed_entry_partitions() FROM PUBLIC`,
      `GRANT EXECUTE ON FUNCTION measurement.maintain_feed_entry_partitions() TO ${role}`,
      `SELECT measurement.maintain_feed_entry_partitions()`,
    ];
    for (const statement of statements) {
      await queryRunner.query(statement);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const role = quoteIdentifier(
      parseDatabaseEnvironment(process.env).contexts.measurement.user,
    );
    for (const statement of [
      `DROP FUNCTION measurement.maintain_feed_entry_partitions()`,
      `DROP TABLE measurement.hourly_aggregate`,
      `DROP TABLE measurement.feed_entry`,
      `ALTER DEFAULT PRIVILEGES IN SCHEMA measurement GRANT UPDATE, DELETE ON TABLES TO ${role}`,
    ]) {
      await queryRunner.query(statement);
    }
  }
}
