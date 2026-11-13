import type { MetricsPeriod } from "@miramenu/api-client";
import type { Metrics, SessionActor } from "@miramenu/contracts";
import { vi } from "vitest";
import { httpError } from "./fake-admin";
import { accessIn, type World } from "./fake-world";

/** A business's or a branch's figures for a period: the test decides them. */
export type MetricsOf = (scopeId: string, period: MetricsPeriod) => Metrics;

const zero = { entries: 0, views: 0, exposureMs: 0, quickSkips: 0, likes: 0, comments: 0 };

/** Figures without any activity, for the period asked. */
export const emptyMetrics = (period: MetricsPeriod): Metrics => ({
  period,
  totals: { ...zero, exposureAverageMs: null, quickSkipRate: null },
  byDay: [],
  byDish: [],
});

/** The metrics calls over a world, as the given person (ADR-0041): who reaches which figures. */
export function metricsApi(world: World, actor: () => SessionActor | null) {
  const { visible, businessAt, branchAt } = accessIn(world, actor);
  const figures = (scopeId: string, period: MetricsPeriod) => (world.metricsOf ?? ((_, asked) => emptyMetrics(asked)))(scopeId, period);
  return {
    businessMetrics: vi.fn(async (businessId: string, period: MetricsPeriod) => {
      businessAt(businessId);
      if (!visible(businessId).owner) throw httpError(403, "FORBIDDEN");
      return figures(businessId, period);
    }),
    branchMetrics: vi.fn(async (branchId: string, period: MetricsPeriod) => {
      branchAt(branchId);
      return figures(branchId, period);
    }),
  };
}
