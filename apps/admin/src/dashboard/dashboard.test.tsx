import type { MetricsPeriod } from "@miramenu/api-client";
import type { Metrics } from "@miramenu/contracts";
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "../i18n";
import {
  actor,
  business,
  fakeAdminApi,
  here,
  id,
  renderAdmin,
} from "../test/fake-admin";
import { branchDishOf, emptyBranchMenu } from "../test/fake-branch-menu";
import { categoryOf, dishOf, emptyMenu } from "../test/fake-menu";
import { emptyMetrics, type MetricsOf } from "../test/fake-metrics";
import { branchOf, type World } from "../test/fake-world";

// 18:20 of the 13th in Mexico City: the last 7 days are the 7th to the 13th.
const NOW = Date.parse("2026-11-14T00:20:00Z");
beforeEach(() => vi.useFakeTimers({ toFake: ["Date"], now: NOW }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const LA_FONDA = id(10);
const CENTRO = id(11);
const DASHBOARD = `/businesses/${LA_FONDA}/dashboard`;
const TACOS = categoryOf(20, "Tacos", 0);
const PASTOR = dishOf(30, TACOS.id, "Pastor", 9500, 0);
const HORCHATA = branchDishOf(50, TACOS.id, "Horchata", 3500);
const LAST_7: MetricsPeriod = {
  from: "2026-11-07T06:00:00.000Z",
  to: "2026-11-14T01:00:00.000Z",
  timeZone: "America/Mexico_City",
};
const BEFORE_7: MetricsPeriod = {
  from: "2026-10-31T11:00:00.000Z",
  to: "2026-11-07T06:00:00.000Z",
  timeZone: "America/Mexico_City",
};

const measures = (views: number, extra: Partial<Metrics["totals"]> = {}) => ({
  entries: views + 40,
  views,
  exposureMs: views * 3400,
  quickSkips: 10,
  likes: 9,
  comments: 2,
  ...extra,
});
const current = (period: MetricsPeriod): Metrics => ({
  period,
  totals: { ...measures(120), exposureAverageMs: 3400, quickSkipRate: 0.25 },
  byDay: [
    { ...measures(80), day: "2026-11-12" },
    { ...measures(40), day: "2026-11-13" },
  ],
  byDish: [
    {
      ...measures(30),
      exposureAverageMs: 2000,
      quickSkipRate: null,
      dishId: HORCHATA.id,
    },
    {
      ...measures(90),
      exposureAverageMs: 3900,
      quickSkipRate: 0.1,
      dishId: PASTOR.id,
    },
    {
      ...measures(0),
      exposureAverageMs: null,
      quickSkipRate: null,
      dishId: id(99),
    },
  ],
});
const before = (period: MetricsPeriod): Metrics => ({
  ...emptyMetrics(period),
  totals: { ...measures(100), exposureAverageMs: 3400, quickSkipRate: 0.2 },
});
/** This period's figures, and the period before's: anything else has no activity. */
const figures: MetricsOf = (_, period) =>
  period.from === LAST_7.from
    ? current(period)
    : period.to === LAST_7.from
      ? before(period)
      : emptyMetrics(period);

const world = (metricsOf: MetricsOf = figures): World => ({
  businesses: [business(10, "La Fonda")],
  branches: [branchOf(11, LA_FONDA, "Centro", "centro")],
  users: [],
  mailWorks: true,
  menus: { [LA_FONDA]: emptyMenu({ categories: [TACOS], dishes: [PASTOR] }) },
  branchMenus: { [CENTRO]: emptyBranchMenu({ dishes: [HORCHATA] }) },
  metricsOf,
});
const owner = actor();
const kpi = (label: string) =>
  within(
    screen
      .getByRole("heading", { level: 2, name: label })
      .closest("section") as HTMLElement,
  );
const card = (title: string) =>
  within(
    screen
      .getByRole("heading", { level: 2, name: title })
      .closest("section") as HTMLElement,
  );

describe("a business's dashboard (ADR-0041)", () => {
  it("is reached from the business, with each KPI against the period before", async () => {
    const { api } = fakeAdminApi({ signedIn: owner, world: world() });
    renderAdmin(api, `/businesses/${LA_FONDA}`);
    fireEvent.click(
      await screen.findByRole("link", { name: t("dashboard.open") }),
    );
    expect(here()).toBe(DASHBOARD);
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: t("dashboard.title", { name: "La Fonda" }),
      }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        t("dashboard.periodLabel", { from: "7 nov", to: "13 nov" }),
      ),
    ).toBeTruthy();
    expect(api.businessMetrics).toHaveBeenCalledWith(LA_FONDA, LAST_7);
    expect(api.businessMetrics).toHaveBeenCalledWith(LA_FONDA, BEFORE_7);

    await waitFor(() =>
      expect(
        kpi(t("dashboard.views")).getByText(
          /\+20\s?% vs\. el periodo anterior/,
        ),
      ).toBeTruthy(),
    );
    expect(kpi(t("dashboard.views")).getByText("120")).toBeTruthy();
    expect(kpi(t("dashboard.exposure")).getByText("3.4 s")).toBeTruthy();
    expect(
      kpi(t("dashboard.exposure")).getByText(t("dashboard.same")),
    ).toBeTruthy();
    // The quick skip rate going up is bad news, said in words and in the negative pair.
    const skip = kpi(t("dashboard.quickSkip")).getByText(
      /\+25\s?% vs\. el periodo anterior/,
    );
    expect(skip.className).toMatch(/bad/);
    expect(kpi(t("dashboard.views")).getByText(/\+20\s?%/).className).toMatch(
      /good/,
    );
    expect(
      kpi(t("dashboard.likes")).getByText(t("dashboard.same")),
    ).toBeTruthy();
    // Exactly one accent card.
    expect(document.querySelectorAll(".dashboard-accent")).toHaveLength(1);
  });

  it("says — for a rate with nothing to divide by, and nothing that is not there", async () => {
    const { api } = fakeAdminApi({
      signedIn: owner,
      world: world((_, period) => emptyMetrics(period)),
    });
    renderAdmin(api, DASHBOARD);
    await screen.findByRole("heading", {
      level: 2,
      name: t("dashboard.exposure"),
    });
    expect(
      kpi(t("dashboard.exposure")).getByText(t("dashboard.none")),
    ).toBeTruthy();
    expect(
      kpi(t("dashboard.exposure")).getByText(t("dashboard.noRate")),
    ).toBeTruthy();
    expect(kpi(t("dashboard.quickSkip")).queryByText(/vs\./)).toBeNull();
    expect(kpi(t("dashboard.views")).getByText("0")).toBeTruthy();
    expect(
      screen.getByRole("img", { name: t("dashboard.noRate") }),
    ).toBeTruthy();
    expect(screen.getByText(t("dashboard.rankingEmpty"))).toBeTruthy();
    expect(screen.getByText(t("dashboard.noDishes"))).toBeTruthy();
  });

  it("changes the period with a preset or whole days of the admin's choice", async () => {
    const { api } = fakeAdminApi({ signedIn: owner, world: world() });
    renderAdmin(api, DASHBOARD);
    await screen.findByText("120");
    fireEvent.click(
      screen.getByRole("button", { name: t("dashboard.last30") }),
    );
    await waitFor(() =>
      expect(api.businessMetrics).toHaveBeenCalledWith(LA_FONDA, {
        ...LAST_7,
        from: "2026-10-15T06:00:00.000Z",
      }),
    );
    expect(
      screen
        .getByRole("button", { name: t("dashboard.last30") })
        .getAttribute("aria-pressed"),
    ).toBe("true");

    fireEvent.click(
      screen.getByRole("button", { name: t("dashboard.custom") }),
    );
    fireEvent.change(screen.getByLabelText(t("dashboard.from")), {
      target: { value: "2026-11-05" },
    });
    fireEvent.change(screen.getByLabelText(t("dashboard.to")), {
      target: { value: "2026-11-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: t("dashboard.apply") }));
    expect(screen.getByText(t("dashboard.problem.order"))).toBeTruthy();
    fireEvent.change(screen.getByLabelText(t("dashboard.to")), {
      target: { value: "2026-11-06" },
    });
    fireEvent.click(screen.getByRole("button", { name: t("dashboard.apply") }));
    await waitFor(() =>
      expect(api.businessMetrics).toHaveBeenCalledWith(LA_FONDA, {
        from: "2026-11-05T06:00:00.000Z",
        to: "2026-11-07T06:00:00.000Z",
        timeZone: "America/Mexico_City",
      }),
    );
    expect(
      await screen.findByText(
        t("dashboard.periodLabel", { from: "5 nov", to: "6 nov" }),
      ),
    ).toBeTruthy();
  });

  it("draws the views by day, walked with the keyboard and read in a table", async () => {
    const { api } = fakeAdminApi({ signedIn: owner, world: world() });
    renderAdmin(api, DASHBOARD);
    await screen.findByText("120");
    const chart = screen.getByRole("group", {
      name: t("dashboard.trendChart", { from: "7 nov", to: "13 nov" }),
    });
    fireEvent.keyDown(chart, { key: "End" });
    expect(
      screen.getByText(
        t("dashboard.trendPoint", { views: "40", day: "13 nov" }),
      ),
    ).toBeTruthy();
    fireEvent.keyDown(chart, { key: "ArrowLeft" });
    expect(
      screen.getByText(
        t("dashboard.trendPoint", { views: "80", day: "12 nov" }),
      ),
    ).toBeTruthy();
    fireEvent.keyDown(chart, { key: "Home" });
    expect(
      screen.getByText(t("dashboard.trendPoint", { views: "0", day: "7 nov" })),
    ).toBeTruthy();

    const table = within(
      screen
        .getByText(t("dashboard.trendTable"))
        .closest("details") as HTMLElement,
    );
    // Every day of the period, a day without activity as none.
    expect(table.getAllByRole("row")).toHaveLength(8);
    expect(
      within(
        table
          .getByRole("rowheader", { name: "12 nov" })
          .closest("tr") as HTMLElement,
      ).getByText("80"),
    ).toBeTruthy();
  });

  it("shows the share of entries that reached a view, ranks the dishes and lists each by name", async () => {
    const { api } = fakeAdminApi({ signedIn: owner, world: world() });
    renderAdmin(api, DASHBOARD);
    await screen.findByText("120");
    expect(
      screen.getByRole("img", {
        name: t("dashboard.viewRateOf", {
          rate: new Intl.NumberFormat("es-MX", { style: "percent" }).format(
            0.75,
          ),
        }),
      }),
    ).toBeTruthy();

    const ranking = card(t("dashboard.ranking"));
    expect(
      ranking.getAllByRole("listitem").map((each) => each.textContent),
    ).toEqual(["Pastor90", "Horchata30"]);
    const rows = card(t("dashboard.dishes"))
      .getAllByRole("rowheader")
      .map((each) => each.textContent);
    // Base and the branch's own dishes by name; one off the menus says so.
    expect(rows).toEqual(["Pastor", "Horchata", t("dashboard.unknownDish")]);
    const pastor = within(
      card(t("dashboard.dishes"))
        .getByRole("rowheader", { name: "Pastor" })
        .closest("tr") as HTMLElement,
    );
    expect(pastor.getByText("3.9 s")).toBeTruthy();
    const horchata = within(
      card(t("dashboard.dishes"))
        .getByRole("rowheader", { name: "Horchata" })
        .closest("tr") as HTMLElement,
    );
    expect(horchata.getAllByText(t("dashboard.none"))).toHaveLength(1);
  });

  it("goes to a branch's dashboard from the business's", async () => {
    const { api } = fakeAdminApi({ signedIn: owner, world: world() });
    renderAdmin(api, DASHBOARD);
    await screen.findByText("120");
    fireEvent.change(await screen.findByLabelText(t("dashboard.scope")), {
      target: { value: CENTRO },
    });
    expect(here()).toBe(`/branches/${CENTRO}/dashboard`);
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: t("dashboard.title", { name: "Centro" }),
      }),
    ).toBeTruthy();
    await waitFor(() =>
      expect(api.branchMetrics).toHaveBeenCalledWith(CENTRO, LAST_7),
    );
  });
});

describe("who sees which figures", () => {
  it("shows a branch admin its branch's dashboard, and not the business's", async () => {
    const centroAdmin = actor([
      { businessId: LA_FONDA, branchId: CENTRO, role: "branch_admin" },
    ]);
    const { api } = fakeAdminApi({ signedIn: centroAdmin, world: world() });
    renderAdmin(api, `/businesses/${LA_FONDA}`);
    await screen.findByRole("heading", { level: 1, name: "La Fonda" });
    expect(
      screen.queryByRole("link", { name: t("dashboard.open") }),
    ).toBeNull();
    cleanup();

    renderAdmin(api, `/branches/${CENTRO}`);
    fireEvent.click(
      await screen.findByRole("link", { name: t("dashboard.open") }),
    );
    expect(await screen.findByText("120")).toBeTruthy();
    expect(api.branchMetrics).toHaveBeenCalledWith(CENTRO, LAST_7);
    cleanup();

    renderAdmin(api, DASHBOARD);
    expect(await screen.findByText(t("dashboard.forbidden"))).toBeTruthy();
  });
});
