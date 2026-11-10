import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { selectRows } from '../../../infrastructure/database/query';
import { MenuDishes } from '../../catalog';
import { aggregateDeltas } from '../domain/aggregate-plan';
import type { EntryBatchJob } from './entry-batch-job';

interface InsertedRow {
  branch_id: string;
  dish_id: string;
  entered_at: Date;
  exposure_ms: number;
  valid_view: boolean;
  quick_skip: boolean;
}

/**
 * Saves a batch and adds it to the hourly aggregate in one transaction (ADR-0013): only
 * the entries actually inserted are added, so a retried or duplicated batch never counts
 * twice. Entries of dishes that are not on the branch's current menu are dropped first
 * (ADR-0022): nobody mixes another business's dishes into a dashboard.
 */
@Injectable()
export class EntryRecorder {
  constructor(
    @InjectDataSource('measurement') private readonly dataSource: DataSource,
    private readonly menuDishes: MenuDishes,
  ) {}

  async record(
    job: EntryBatchJob,
  ): Promise<{ recorded: number; discarded: number }> {
    const onMenu = await this.onCurrentMenus(job.entries);
    if (onMenu.length === 0)
      return { recorded: 0, discarded: job.entries.length };
    const column = <K extends keyof (typeof onMenu)[number]>(key: K) =>
      onMenu.map((entry) => entry[key]);
    return this.dataSource.transaction(async (manager) => {
      const inserted = await selectRows<InsertedRow>(
        manager,
        `INSERT INTO measurement.feed_entry
           (entry_id, entered_at, device_id, branch_id, dish_id, exposure_ms, valid_view, exit, quick_skip, received_at)
         SELECT entry_id, entered_at, $3::uuid, branch_id, dish_id, exposure_ms, valid_view, exit, quick_skip, $10::timestamptz
         FROM unnest($1::uuid[], $2::timestamptz[], $4::uuid[], $5::uuid[], $6::int[], $7::boolean[], $8::text[], $9::boolean[])
           AS batch (entry_id, entered_at, branch_id, dish_id, exposure_ms, valid_view, exit, quick_skip)
         ON CONFLICT (entered_at, entry_id) DO NOTHING
         RETURNING branch_id, dish_id, entered_at, exposure_ms, valid_view, quick_skip`,
        [
          column('entryId'),
          column('enteredAt'),
          job.deviceId,
          column('branchId'),
          column('dishId'),
          column('exposureMs'),
          column('validView'),
          column('exit'),
          column('quickSkip'),
          job.receivedAt,
        ],
      );
      const deltas = aggregateDeltas(
        inserted.map((row) => ({
          branchId: row.branch_id,
          dishId: row.dish_id,
          enteredAt: row.entered_at,
          exposureMs: row.exposure_ms,
          validView: row.valid_view,
          quickSkip: row.quick_skip,
        })),
      );
      if (deltas.length > 0) {
        const delta = <K extends keyof (typeof deltas)[number]>(key: K) =>
          deltas.map((row) => row[key]);
        await manager.query(
          `INSERT INTO measurement.hourly_aggregate
             (branch_id, dish_id, hour, entries, views, exposure_ms, quick_skips)
           SELECT * FROM unnest($1::uuid[], $2::uuid[], $3::timestamptz[], $4::int[], $5::int[], $6::bigint[], $7::int[])
           ON CONFLICT (branch_id, dish_id, hour) DO UPDATE SET
             entries = hourly_aggregate.entries + EXCLUDED.entries,
             views = hourly_aggregate.views + EXCLUDED.views,
             exposure_ms = hourly_aggregate.exposure_ms + EXCLUDED.exposure_ms,
             quick_skips = hourly_aggregate.quick_skips + EXCLUDED.quick_skips`,
          [
            delta('branchId'),
            delta('dishId'),
            delta('hour'),
            delta('entries'),
            delta('views'),
            delta('exposureMs'),
            delta('quickSkips'),
          ],
        );
      }
      return {
        recorded: inserted.length,
        discarded: job.entries.length - onMenu.length,
      };
    });
  }

  /** Compared with the menu in force now, so a late entry of a removed dish goes too. */
  private async onCurrentMenus(
    entries: EntryBatchJob['entries'],
  ): Promise<EntryBatchJob['entries']> {
    const branchIds = [...new Set(entries.map((entry) => entry.branchId))];
    const menus = new Map(
      await Promise.all(
        branchIds.map(
          async (branchId) =>
            [branchId, await this.menuDishes.dishIdsOf(branchId)] as const,
        ),
      ),
    );
    return entries.filter((entry) =>
      menus.get(entry.branchId)?.has(entry.dishId),
    );
  }
}
