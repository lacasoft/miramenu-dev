import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Metrics, MetricsQuery } from '@miramenu/contracts';
import type { DataSource } from 'typeorm';
import { selectRows } from '../../../infrastructure/database/query';
import {
  AccessControl,
  type Actor,
  BranchDirectory,
} from '../../business-access';
import { InteractionCounts } from '../../interactions';
import {
  addMeasures,
  type Measures,
  NO_MEASURES,
  ratesOf,
} from '../domain/metrics-math';
import { notFound } from './errors';

interface AggregateRow {
  dish_id: string;
  day: string;
  entries: string;
  views: string;
  exposure_ms: string;
  quick_skips: string;
}

const add = (
  map: Map<string, Measures>,
  key: string,
  measures: Partial<Measures>,
) => map.set(key, addMeasures(map.get(key) ?? NO_MEASURES, measures));

/**
 * The dashboard (design: "Métricas por sucursal o agrupadas por negocio"): the hourly
 * aggregates of a period, plus the likes and approved comments of Interactions. A branch
 * admin sees only their branch (design: "ve solo el dashboard de su sucursal").
 */
@Injectable()
export class MetricsService {
  constructor(
    @InjectDataSource('measurement') private readonly dataSource: DataSource,
    private readonly access: AccessControl,
    private readonly branches: BranchDirectory,
    private readonly interactions: InteractionCounts,
  ) {}

  async ofBranch(
    actor: Actor,
    branchId: string,
    query: MetricsQuery,
  ): Promise<Metrics> {
    await this.access.assertBranch(actor, branchId, 'view');
    return this.compute([branchId], query);
  }

  /** Grouped by business: "operate", so a branch admin never sees the others' numbers. */
  async ofBusiness(
    actor: Actor,
    businessId: string,
    query: MetricsQuery,
  ): Promise<Metrics> {
    this.access.assertBusiness(actor, businessId, 'operate');
    const branchIds = await this.branches.branchIdsOf(businessId);
    if (branchIds === null) throw notFound();
    return this.compute(branchIds, query);
  }

  private async compute(
    branchIds: readonly string[],
    query: MetricsQuery,
  ): Promise<Metrics> {
    const from = new Date(query.from);
    const to = new Date(query.to);
    const [aggregates, social] = await Promise.all([
      this.aggregates(branchIds, from, to, query.timeZone),
      this.interactions.forPeriod(branchIds, from, to, query.timeZone),
    ]);
    const byDish = new Map<string, Measures>();
    const byDay = new Map<string, Measures>();
    for (const row of aggregates) {
      const measures = {
        entries: Number(row.entries),
        views: Number(row.views),
        exposureMs: Number(row.exposure_ms),
        quickSkips: Number(row.quick_skips),
      };
      add(byDish, row.dish_id, measures);
      add(byDay, row.day, measures);
    }
    for (const row of social) {
      const measures = { likes: row.likes, comments: row.comments };
      add(byDish, row.dishId, measures);
      add(byDay, row.day, measures);
    }
    const totals = [...byDish.values()].reduce(addMeasures, NO_MEASURES);
    return {
      period: {
        from: from.toISOString(),
        to: to.toISOString(),
        timeZone: query.timeZone,
      },
      totals: { ...totals, ...ratesOf(totals) },
      byDay: [...byDay.entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([day, measures]) => ({ day, ...measures })),
      // Most viewed first: the dashboard's rankings start from here.
      byDish: [...byDish.entries()]
        .sort(([idA, a], [idB, b]) => b.views - a.views || (idA < idB ? -1 : 1))
        .map(([dishId, measures]) => ({
          dishId,
          ...measures,
          ...ratesOf(measures),
        })),
    };
  }

  private aggregates(
    branchIds: readonly string[],
    from: Date,
    to: Date,
    timeZone: string,
  ): Promise<AggregateRow[]> {
    if (branchIds.length === 0) return Promise.resolve([]);
    return selectRows<AggregateRow>(
      this.dataSource.manager,
      `SELECT dish_id, to_char(hour AT TIME ZONE $4, 'YYYY-MM-DD') AS day,
         sum(entries) AS entries, sum(views) AS views,
         sum(exposure_ms) AS exposure_ms, sum(quick_skips) AS quick_skips
       FROM measurement.hourly_aggregate
       WHERE branch_id = ANY($1::uuid[]) AND hour >= $2 AND hour < $3
       GROUP BY 1, 2`,
      [branchIds, from, to, timeZone],
    );
  }
}
