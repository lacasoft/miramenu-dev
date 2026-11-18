import type { Metrics } from "@miramenu/contracts";

/** The dashboard's period: whole hours (the aggregates are hourly), read in its time zone. */
export interface Period {
  from: string;
  to: string;
}

/** The dashboard reads Mexico's days (RNF-06: one region today). */
export const DASHBOARD_TIME_ZONE = "America/Mexico_City";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MAX_DAYS = 400;

const pad = (value: number) => String(value).padStart(2, "0");

/** The wall clock of an instant in a time zone, through Intl: no library, no guessing. */
function wallClockOf(instant: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const part = (type: string) => Number(parts.find((each) => each.type === type)?.value);
  return {
    year: part("year"),
    month: part("month"),
    day: part("day"),
    hour: part("hour"),
    minute: part("minute"),
    second: part("second"),
  };
}

/** How far the zone's clock is ahead of UTC at an instant. */
function offsetAt(instant: number, timeZone: string): number {
  const wall = wallClockOf(instant, timeZone);
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  return asUtc - (instant - (instant % 1000));
}

/** The local date of an instant, as `YYYY-MM-DD`. */
export function localDateOf(instant: number, timeZone: string): string {
  const wall = wallClockOf(instant, timeZone);
  return `${wall.year}-${pad(wall.month)}-${pad(wall.day)}`;
}

/** A date `days` after another, both `YYYY-MM-DD`. */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + days)).toISOString().slice(0, 10);
}

/**
 * The instant a local date starts in its zone, floored to the hour the aggregates use.
 * Read twice, so a change of offset on that day lands on its own midnight.
 */
export function midnightOf(date: string, timeZone: string): number {
  const [year, month, day] = date.split("-").map(Number);
  const asUtc = Date.UTC(year!, month! - 1, day!);
  const first = asUtc - offsetAt(asUtc, timeZone);
  const midnight = asUtc - offsetAt(first, timeZone);
  return Math.floor(midnight / HOUR_MS) * HOUR_MS;
}

const isoOf = (instant: number) => new Date(instant).toISOString();

export type Preset = 7 | 30 | 90;

/** The last `days` local days, today included up to the hour now ends. */
export function presetPeriodOf(days: Preset, now: number, timeZone: string): Period {
  const to = Math.ceil((now + 1) / HOUR_MS) * HOUR_MS;
  const first = addDays(localDateOf(now, timeZone), -(days - 1));
  return { from: isoOf(midnightOf(first, timeZone)), to: isoOf(to) };
}

export type PeriodProblem = "required" | "order" | "tooLong";

/** A period of whole local days, `start` to `end` both included, up to 400 days. */
export function customPeriodOf(
  start: string,
  end: string,
  timeZone: string,
): { period: Period } | { problem: PeriodProblem } {
  const date = /^\d{4}-\d{2}-\d{2}$/;
  if (!date.test(start) || !date.test(end)) return { problem: "required" };
  const from = midnightOf(start, timeZone);
  const to = midnightOf(addDays(end, 1), timeZone);
  if (to <= from) return { problem: "order" };
  if (to - from > MAX_DAYS * DAY_MS) return { problem: "tooLong" };
  return { period: { from: isoOf(from), to: isoOf(to) } };
}

/** The period just before, of the same length: what each figure is compared with. */
export function previousPeriodOf({ from, to }: Period): Period {
  const start = Date.parse(from);
  return { from: isoOf(start - (Date.parse(to) - start)), to: from };
}

/** Every local day a period touches, oldest first. */
export function daysOf({ from, to }: Period, timeZone: string): string[] {
  const last = localDateOf(Date.parse(to) - 1, timeZone);
  const days: string[] = [];
  for (let day = localDateOf(Date.parse(from), timeZone); day <= last; day = addDays(day, 1)) days.push(day);
  return days;
}

/** Views per day over the whole period: a day without activity had none. */
export function viewsByDayOf(metrics: Pick<Metrics, "byDay">, days: readonly string[]): { day: string; views: number }[] {
  const views = new Map(metrics.byDay.map((each) => [each.day, each.views]));
  return days.map((day) => ({ day, views: views.get(day) ?? 0 }));
}

/** How a figure moved against the period before, and whether that is good news. */
export interface Change {
  direction: "up" | "down" | "flat";
  /** The move against the figure before; null with nothing before to compare with. */
  ratio: number | null;
  good: boolean | null;
}

/**
 * A figure against the same one in the period before. With no figure now or before (a
 * rate without denominator), there is no change to say; from zero, only its direction.
 */
export function changeOf(current: number | null, previous: number | null, higherIsBetter: boolean): Change | null {
  if (current === null || previous === null) return null;
  const direction = current === previous ? "flat" : current > previous ? "up" : "down";
  const ratio = previous === 0 ? null : (current - previous) / previous;
  const good = direction === "flat" ? null : (direction === "up") === higherIsBetter;
  return { direction, ratio, good };
}

/** Share of the entries that reached a valid view; null without entries (never 0). */
export const viewRateOf = (totals: Pick<Metrics["totals"], "entries" | "views">): number | null =>
  totals.entries === 0 ? null : totals.views / totals.entries;

/**
 * Clean ticks for an axis from zero: steps of 1, 2 or 5 times a power of ten, at most
 * four above zero, the last at or above the largest value.
 */
export function ticksOf(max: number): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((each) => each * power).find((each) => each >= rough)!;
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks: number[] = [];
  for (let tick = 0; tick <= top; tick += step) ticks.push(tick);
  return ticks;
}

/** One dish of the period, with its name from the menus it belongs to. */
export type DishRow = Metrics["byDish"][number] & { name: string | null };

/** Every dish of the period, most viewed first; ties by name. */
export function dishRowsOf(metrics: Pick<Metrics, "byDish">, names: ReadonlyMap<string, string>): DishRow[] {
  return metrics.byDish
    .map((dish) => ({ ...dish, name: names.get(dish.dishId) ?? null }))
    .sort((a, b) => b.views - a.views || (a.name ?? "").localeCompare(b.name ?? ""));
}

/** The most viewed dishes: the ranking's bars, only those with views. */
export const rankingOf = (rows: readonly DishRow[], limit = 5): DishRow[] =>
  rows.filter((row) => row.views > 0).slice(0, limit);
