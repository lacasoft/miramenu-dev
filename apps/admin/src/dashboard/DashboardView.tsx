import {
  changeOf,
  DASHBOARD_TIME_ZONE,
  daysOf,
  dishRowsOf,
  loadProblemOf,
  localDateOf,
  presetPeriodOf,
  previousPeriodOf,
  rankingOf,
  viewRateOf,
  viewsByDayOf,
  type Period,
} from "@miramenu/admin-core";
import type { AdminApi, MetricsPeriod } from "@miramenu/api-client";
import type { Metrics } from "@miramenu/contracts";
import {
  formatCount,
  formatPercent,
  formatSeconds,
  formatShortDay,
} from "@miramenu/i18n";
import { useQuery, type QueryKey, type UseQueryResult } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { useAdminApi } from "../app/api-context";
import { callFailureOf } from "../app/failures";
import { t } from "../i18n";
import controls from "../ui/controls.module.css";
import styles from "./Dashboard.module.css";
import { DishTable } from "./DishTable";
import { KpiTile } from "./KpiTile";
import { PeriodFilter, type Choice } from "./PeriodFilter";
import { RankingList } from "./RankingList";
import { TrendChart } from "./TrendChart";
import { ViewRateGauge } from "./ViewRateGauge";

const periodLabelOf = ({ from, to }: Period) =>
  t("dashboard.periodLabel", {
    from: formatShortDay(localDateOf(Date.parse(from), DASHBOARD_TIME_ZONE)),
    to: formatShortDay(localDateOf(Date.parse(to) - 1, DASHBOARD_TIME_ZONE)),
  });

function Figures({
  current,
  previous,
  names,
}: {
  current: Metrics;
  previous: Metrics | undefined;
  names: ReadonlyMap<string, string>;
}) {
  const { totals } = current;
  const before = previous?.totals;
  const period = { from: current.period.from, to: current.period.to };
  const rows = dishRowsOf(current, names);
  const change = (
    now: number | null,
    then: number | null | undefined,
    higherIsBetter: boolean,
  ) => (then === undefined ? null : changeOf(now, then, higherIsBetter));
  return (
    <>
      <KpiTile
        accent
        label={t("dashboard.views")}
        value={formatCount(totals.views)}
        change={change(totals.views, before?.views, true)}
      />
      <KpiTile
        label={t("dashboard.exposure")}
        value={
          totals.exposureAverageMs === null
            ? null
            : formatSeconds(totals.exposureAverageMs)
        }
        missing={t("dashboard.noRate")}
        change={change(
          totals.exposureAverageMs,
          before?.exposureAverageMs,
          true,
        )}
      />
      <KpiTile
        label={t("dashboard.quickSkip")}
        value={
          totals.quickSkipRate === null
            ? null
            : formatPercent(totals.quickSkipRate)
        }
        missing={t("dashboard.noRate")}
        change={change(totals.quickSkipRate, before?.quickSkipRate, false)}
      />
      <KpiTile
        label={t("dashboard.likes")}
        value={formatCount(totals.likes)}
        change={change(totals.likes, before?.likes, true)}
      />
      <section
        className={`${styles.card} ${styles.wide}`}
        aria-labelledby="dashboard-trend"
      >
        <h2 id="dashboard-trend" className={styles.cardTitle}>
          {t("dashboard.trend")}
        </h2>
        <TrendChart
          days={viewsByDayOf(current, daysOf(period, DASHBOARD_TIME_ZONE))}
        />
      </section>
      <section className={styles.card} aria-labelledby="dashboard-rate">
        <h2 id="dashboard-rate" className={styles.cardTitle}>
          {t("dashboard.viewRate")}
        </h2>
        <ViewRateGauge rate={viewRateOf(totals)} />
      </section>
      <section className={styles.card} aria-labelledby="dashboard-ranking">
        <h2 id="dashboard-ranking" className={styles.cardTitle}>
          {t("dashboard.ranking")}
        </h2>
        <RankingList rows={rankingOf(rows)} />
      </section>
      <section
        className={`${styles.card} ${styles.full}`}
        aria-labelledby="dashboard-dishes"
      >
        <h2 id="dashboard-dishes" className={styles.cardTitle}>
          {t("dashboard.dishes")}
        </h2>
        <DishTable rows={rows} />
      </section>
    </>
  );
}

/** The figures while they load, or why they could not: a refusal is said, an outage retried. */
function Unloaded({ query }: { query: UseQueryResult<Metrics> }) {
  if (query.isPending)
    return (
      <p role="status" aria-busy="true" className={controls.notice}>
        {t("dashboard.loading")}
      </p>
    );
  const problem = loadProblemOf(callFailureOf(query.error));
  if (problem !== "unavailable")
    return (
      <p className={controls.problem} role="alert">
        {t(problem === "forbidden" ? "dashboard.forbidden" : "save.notFound")}
      </p>
    );
  return (
    <div className={styles.state}>
      <p className={controls.problem} role="alert">
        {t("dashboard.failed")}
      </p>
      <button type="button" className={controls.secondary} onClick={() => void query.refetch()}>
        {t("status.retry")}
      </button>
    </div>
  );
}

/**
 * A dashboard (design system: the dashboard's composition): one row of filters above
 * everything they scope, four KPIs against the period before, then the trend by day,
 * the gauge and the ranking, and every dish in a table. Changing the period keeps the
 * figures in place, dimmed, until the new ones arrive.
 */
export function DashboardView({
  queryKey,
  load,
  names,
  scope,
}: {
  queryKey: QueryKey;
  load: (api: AdminApi, period: MetricsPeriod) => Promise<Metrics>;
  /** Each dish's name, from the menus the figures cover. */
  names: ReadonlyMap<string, string>;
  /** In a business's dashboard, the choice of a branch instead. */
  scope?: ReactNode;
}) {
  const api = useAdminApi();
  const [choice, setChoice] = useState<Choice>(7);
  const [period, setPeriod] = useState<Period>(() =>
    presetPeriodOf(7, Date.now(), DASHBOARD_TIME_ZONE),
  );
  const previousPeriod = previousPeriodOf(period);
  const read = (of: Period) => ({
    queryKey: [...queryKey, of.from, of.to],
    queryFn: () => load(api, { ...of, timeZone: DASHBOARD_TIME_ZONE }),
    placeholderData: <T,>(previous: T) => previous,
  });
  const current = useQuery(read(period));
  const previous = useQuery(read(previousPeriod));

  return (
    <>
      <div
        className={styles.filterRow}
        role="group"
        aria-label={t("dashboard.filters")}
      >
        <PeriodFilter
          choice={choice}
          onChange={(next, nextPeriod) => {
            setChoice(next);
            setPeriod(nextPeriod);
          }}
        />
        {scope}
      </div>
      <p className={styles.periodLabel}>{periodLabelOf(period)}</p>
      {current.data === undefined ? (
        <Unloaded query={current} />
      ) : (
        <div
          className={`${styles.grid} ${current.isPlaceholderData ? styles.stale : ""}`}
          aria-busy={current.isPlaceholderData}
        >
          <Figures
            current={current.data}
            previous={previous.isPlaceholderData ? undefined : previous.data}
            names={names}
          />
        </div>
      )}
    </>
  );
}
