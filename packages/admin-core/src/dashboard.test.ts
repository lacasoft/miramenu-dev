import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addDays,
  changeOf,
  customPeriodOf,
  daysOf,
  dishRowsOf,
  localDateOf,
  midnightOf,
  presetPeriodOf,
  previousPeriodOf,
  rankingOf,
  ticksOf,
  viewRateOf,
  viewsByDayOf,
} from "./dashboard.ts";
import { hrefOf, routeOf, type AdminRoute } from "./routes.ts";

const MX = "America/Mexico_City";
const measures = { entries: 0, views: 0, exposureMs: 0, quickSkips: 0, likes: 0, comments: 0 };
const rates = { exposureAverageMs: null, quickSkipRate: null };
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("the dashboards' pages", () => {
  it("live under their business or their branch, with the id checked", () => {
    const routes: [string, AdminRoute][] = [
      [`/businesses/${id(10)}/dashboard`, { screen: "businessDashboard", businessId: id(10) }],
      [`/branches/${id(11)}/dashboard`, { screen: "branchDashboard", branchId: id(11) }],
    ];
    for (const [path, route] of routes) {
      assert.deepEqual(routeOf({ pathname: path, search: "" }), route, path);
      assert.equal(hrefOf(route), path);
    }
    assert.deepEqual(routeOf({ pathname: "/branches/x/dashboard", search: "" }), { screen: "notFound" });
  });
});

describe("days in the dashboard's time zone", () => {
  it("reads Mexico's date of an instant, and its midnight in UTC", () => {
    // 2026-11-14 05:30 UTC is still the 13th in Mexico City (UTC-6).
    assert.equal(localDateOf(Date.parse("2026-11-14T05:30:00Z"), MX), "2026-11-13");
    assert.equal(localDateOf(Date.parse("2026-11-14T06:00:00Z"), MX), "2026-11-14");
    assert.equal(new Date(midnightOf("2026-11-13", MX)).toISOString(), "2026-11-13T06:00:00.000Z");
  });

  it("finds a midnight on the days a zone changes its offset", () => {
    const ny = "America/New_York";
    assert.equal(new Date(midnightOf("2026-03-08", ny)).toISOString(), "2026-03-08T05:00:00.000Z");
    assert.equal(new Date(midnightOf("2026-11-01", ny)).toISOString(), "2026-11-01T04:00:00.000Z");
    assert.equal(new Date(midnightOf("2026-11-02", ny)).toISOString(), "2026-11-02T05:00:00.000Z");
  });

  it("adds days across months and years", () => {
    assert.equal(addDays("2026-12-30", 3), "2027-01-02");
    assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  });
});

describe("the dashboard's periods", () => {
  const now = Date.parse("2026-11-14T00:20:00Z"); // 18:20 of the 13th in Mexico City

  it("covers the last days, today included up to the end of this hour", () => {
    assert.deepEqual(presetPeriodOf(7, now, MX), { from: "2026-11-07T06:00:00.000Z", to: "2026-11-14T01:00:00.000Z" });
    assert.equal(presetPeriodOf(30, now, MX).from, "2026-10-15T06:00:00.000Z");
    // Right on the hour, the hour now starting is included.
    assert.equal(presetPeriodOf(7, Date.parse("2026-11-14T00:00:00Z"), MX).to, "2026-11-14T01:00:00.000Z");
  });

  it("takes whole local days of the admin's own choice, up to 400", () => {
    assert.deepEqual(customPeriodOf("2026-11-01", "2026-11-03", MX), {
      period: { from: "2026-11-01T06:00:00.000Z", to: "2026-11-04T06:00:00.000Z" },
    });
    assert.deepEqual(customPeriodOf("2026-11-03", "2026-11-03", MX), {
      period: { from: "2026-11-03T06:00:00.000Z", to: "2026-11-04T06:00:00.000Z" },
    });
    assert.deepEqual(customPeriodOf("", "2026-11-03", MX), { problem: "required" });
    assert.deepEqual(customPeriodOf("2026-11-04", "2026-11-03", MX), { problem: "order" });
    assert.ok("period" in customPeriodOf("2025-10-10", "2026-11-13", MX));
    assert.deepEqual(customPeriodOf("2025-10-09", "2026-11-13", MX), { problem: "tooLong" });
  });

  it("compares with the period just before, of the same length", () => {
    assert.deepEqual(previousPeriodOf({ from: "2026-11-07T06:00:00.000Z", to: "2026-11-14T01:00:00.000Z" }), {
      from: "2026-10-31T11:00:00.000Z",
      to: "2026-11-07T06:00:00.000Z",
    });
  });

  it("lists every local day of a period, and a day without activity as none", () => {
    const period = { from: "2026-11-11T06:00:00.000Z", to: "2026-11-14T01:00:00.000Z" };
    const days = daysOf(period, MX);
    assert.deepEqual(days, ["2026-11-11", "2026-11-12", "2026-11-13"]);
    assert.deepEqual(viewsByDayOf({ byDay: [{ ...measures, day: "2026-11-12", views: 7 }] }, days), [
      { day: "2026-11-11", views: 0 },
      { day: "2026-11-12", views: 7 },
      { day: "2026-11-13", views: 0 },
    ]);
  });
});

describe("the dashboard's figures", () => {
  it("says how a figure moved, and whether that is good, as each measure sees it", () => {
    assert.deepEqual(changeOf(120, 100, true), { direction: "up", ratio: 0.2, good: true });
    assert.deepEqual(changeOf(0.75, 0.5, false), { direction: "up", ratio: 0.5, good: false });
    assert.deepEqual(changeOf(80, 100, true), { direction: "down", ratio: -0.2, good: false });
    assert.deepEqual(changeOf(5, 5, true), { direction: "flat", ratio: 0, good: null });
    assert.deepEqual(changeOf(5, 0, true), { direction: "up", ratio: null, good: true });
    assert.equal(changeOf(null, 0.2, false), null);
    assert.equal(changeOf(0.2, null, false), null);
  });

  it("gives the share of entries that reached a view, and none without entries", () => {
    assert.equal(viewRateOf({ entries: 8, views: 6 }), 0.75);
    assert.equal(viewRateOf({ entries: 0, views: 0 }), null);
  });

  it("draws an axis with clean ticks from zero", () => {
    assert.deepEqual(ticksOf(0), [0, 1]);
    assert.deepEqual(ticksOf(3), [0, 1, 2, 3]);
    assert.deepEqual(ticksOf(7), [0, 2, 4, 6, 8]);
    assert.deepEqual(ticksOf(1234), [0, 500, 1000, 1500]);
    assert.deepEqual(ticksOf(40), [0, 10, 20, 30, 40]);
  });

  it("names each dish, most viewed first, and ranks only those with views", () => {
    const dish = (n: number, views: number) => ({ ...measures, ...rates, dishId: id(n), views });
    const rows = dishRowsOf(
      { byDish: [dish(1, 3), dish(2, 9), dish(3, 0), dish(4, 3)] },
      new Map([
        [id(1), "Suadero"],
        [id(2), "Pastor"],
        [id(4), "Campechano"],
      ]),
    );
    assert.deepEqual(rows.map((row) => row.name), ["Pastor", "Campechano", "Suadero", null]);
    assert.deepEqual(rankingOf(rows, 2).map((row) => row.name), ["Pastor", "Campechano"]);
    assert.deepEqual(rankingOf(rows).map((row) => row.views), [9, 3, 3]);
  });
});
