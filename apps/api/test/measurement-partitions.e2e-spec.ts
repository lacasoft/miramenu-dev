import type { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import type { App } from 'supertest/types';
import type { DataSource } from 'typeorm';
import { asOwner } from './support/admin-fixtures';
import { createTestApp } from './support/test-app';

const DAY_MS = 24 * 60 * 60 * 1000;
const dayName = (offsetDays: number) => {
  const day = new Date(Date.now() + offsetDays * DAY_MS);
  return `feed_entry_p${day.toISOString().slice(0, 10).replaceAll('-', '')}`;
};
const dayBounds = (offsetDays: number) => {
  const start = new Date(Date.now() + offsetDays * DAY_MS);
  start.setUTCHours(0, 0, 0, 0);
  return [start, new Date(start.getTime() + DAY_MS)].map((d) =>
    d.toISOString(),
  );
};

const partitions = () =>
  asOwner(async (client) => {
    const result = await client.query<{ name: string }>(
      `SELECT child.relname AS name FROM pg_inherits inheritance
       JOIN pg_class child ON child.oid = inheritance.inhrelid
       JOIN pg_class parent ON parent.oid = inheritance.inhparent
       WHERE parent.relname = 'feed_entry' ORDER BY 1`,
    );
    return result.rows.map((row) => row.name);
  });

describe('Daily partitions of the feed entries (e2e)', () => {
  let app: INestApplication<App>;
  let measurement: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    measurement = app.get<DataSource>(getDataSourceToken('measurement'));
  });

  afterAll(async () => {
    await app.close();
  });

  it('never lets the API role create a table, but lets it keep the partitions', async () => {
    await expect(
      measurement.query(`CREATE TABLE measurement.intruder (id int)`),
    ).rejects.toThrow(/permission denied/);

    await measurement.query(
      `SELECT measurement.maintain_feed_entry_partitions()`,
    );

    const names = await partitions();
    for (const offset of [-7, 0, 1, 7]) {
      expect(names).toContain(dayName(offset));
    }
  });

  it('drops the days past 90 and keeps the ones within', async () => {
    const [oldStart, oldEnd] = dayBounds(-100);
    const [keptStart, keptEnd] = dayBounds(-80);
    await asOwner(async (client) => {
      for (const [name, start, end] of [
        [dayName(-100), oldStart, oldEnd],
        [dayName(-80), keptStart, keptEnd],
      ]) {
        await client.query(
          `CREATE TABLE IF NOT EXISTS measurement.${name} PARTITION OF measurement.feed_entry
           FOR VALUES FROM ('${start}') TO ('${end}')`,
        );
      }
    });

    await measurement.query(
      `SELECT measurement.maintain_feed_entry_partitions()`,
    );

    const names = await partitions();
    expect(names).not.toContain(dayName(-100));
    expect(names).toContain(dayName(-80));
  });

  it('takes no arguments, so the API role cannot ask it to drop recent days', async () => {
    await expect(
      measurement.query(`SELECT measurement.maintain_feed_entry_partitions(0)`),
    ).rejects.toThrow(/does not exist/);
  });

  it('keeps entries append-only for the API role, partitions included', async () => {
    for (const statement of [
      `UPDATE measurement.feed_entry SET exposure_ms = 0`,
      `DELETE FROM measurement.feed_entry`,
      `UPDATE measurement.${dayName(0)} SET exposure_ms = 0`,
      `DELETE FROM measurement.${dayName(0)}`,
      `DROP TABLE measurement.${dayName(0)}`,
    ]) {
      await expect(measurement.query(statement)).rejects.toThrow(
        /permission denied|must be owner/,
      );
    }
  });
});
