import { ApiError } from "@miramenu/api-client";
import type {
  PublicationConflict,
  PublishBusinessMenuRequest,
} from "@miramenu/contracts";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { t } from "../i18n";
import {
  actor,
  business,
  fakeAdminApi,
  httpError,
  id,
  renderAdmin,
  settled,
} from "../test/fake-admin";
import {
  categoryOf,
  dishOf,
  emptyMenu,
  type MenuState,
} from "../test/fake-menu";
import { branchOf, type World } from "../test/fake-world";

afterEach(cleanup);

const LA_FONDA = id(10);
const CENTRO = id(11);
const NORTE = id(12);
const MENU = `/businesses/${LA_FONDA}/menu`;
const TACOS = categoryOf(20, "Tacos", 0);
const PASTOR = dishOf(30, TACOS.id, "Pastor", 9500, 0);
const SUADERO_ID = id(31);
const PRICE: PublicationConflict = {
  branchId: CENTRO,
  dishId: PASTOR.id,
  reason: "price_changed",
  dishName: "Pastor",
};
const REMOVED: PublicationConflict = {
  branchId: NORTE,
  dishId: SUADERO_ID,
  reason: "dish_removed",
  dishName: "Suadero",
};
const menuWith = (extra: Partial<MenuState> = {}) =>
  emptyMenu({
    draftVersion: 7,
    publishedVersion: 2,
    profile: { name: "La Fonda", socialLinks: [], logoId: null },
    categories: [{ ...TACOS }],
    dishes: [{ ...PASTOR }],
    ...extra,
  });
const world = (menu: MenuState): World => ({
  businesses: [business(10, "La Fonda")],
  branches: [
    branchOf(11, LA_FONDA, "Centro", "centro"),
    branchOf(12, LA_FONDA, "Norte", "norte"),
  ],
  users: [],
  mailWorks: true,
  menus: { [LA_FONDA]: menu },
});
const press = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));
const priceText = t("publish.conflict.price", {
  branch: "Centro",
  dish: "Pastor",
  price: "$95.00",
});
const removedText = t("publish.conflict.removed", {
  branch: "Norte",
  dish: "Suadero",
});

async function review(menu: MenuState) {
  const { api } = fakeAdminApi({ signedIn: actor(), world: world(menu) });
  renderAdmin(api, MENU);
  fireEvent.click(
    await screen.findByRole("button", { name: t("publish.review") }),
  );
  const calls = () =>
    api.publishBusinessMenu.mock.calls.map(([, request, key]) => ({
      request: request as PublishBusinessMenuRequest,
      key,
    }));
  return { api, calls };
}

describe("publishing the base menu (ADR-0036)", () => {
  it("publishes once every conflict is confirmed, with the reviewed version and a key", async () => {
    const { api, calls } = await review(
      menuWith({ conflicts: [PRICE, REMOVED] }),
    );
    expect(
      screen.getByText(t("publish.conflicts.other", { count: 2 })),
    ).toBeTruthy();
    const centro = await screen.findByLabelText(priceText);
    const norte = screen.getByLabelText(removedText);

    press(t("publish.submit"));
    expect(screen.getByText(t("publish.confirmAll"))).toBeTruthy();
    fireEvent.click(centro);
    press(t("publish.submit"));
    expect(screen.getByText(t("publish.confirmAll"))).toBeTruthy();
    await settled();
    expect(api.publishBusinessMenu).not.toHaveBeenCalled();

    fireEvent.click(norte);
    press(t("publish.submit"));
    expect(
      await screen.findByText(
        t("publish.done.other", { version: 3, count: 2 }),
      ),
    ).toBeTruthy();
    expect(calls()).toEqual([
      {
        request: {
          draftVersion: 7,
          confirmedConflicts: [
            { branchId: CENTRO, dishId: PASTOR.id },
            { branchId: NORTE, dishId: SUADERO_ID },
          ],
        },
        key: expect.stringMatching(/^[A-Za-z0-9_-]{16,128}$/),
      },
    ]);
    expect(
      await screen.findByText(t("publish.version", { version: 3 })),
    ).toBeTruthy();
    expect(screen.queryByLabelText(priceText)).toBeNull();
  });

  it("asks again for a conflict that appeared while the admin reviewed", async () => {
    const menu = menuWith({ conflicts: [PRICE] });
    const { calls } = await review(menu);
    fireEvent.click(await screen.findByLabelText(priceText));
    menu.conflicts = [PRICE, REMOVED];
    press(t("publish.submit"));
    expect(
      await screen.findByText(t("publish.problem.conflictsChanged")),
    ).toBeTruthy();

    const norte = await screen.findByLabelText(removedText);
    expect((norte as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText(priceText) as HTMLInputElement).checked).toBe(
      true,
    );
    press(t("publish.submit"));
    expect(screen.getByText(t("publish.confirmAll"))).toBeTruthy();
    fireEvent.click(norte);
    press(t("publish.submit"));
    expect(
      await screen.findByText(
        t("publish.done.other", { version: 3, count: 2 }),
      ),
    ).toBeTruthy();
    const [first, second] = calls();
    expect(second?.request.confirmedConflicts).toHaveLength(2);
    expect(second?.key).not.toBe(first?.key);
  });

  it("reads again a draft that changed meanwhile, and publishes it with a new key", async () => {
    const menu = menuWith();
    const { calls } = await review(menu);
    // Another admin adds a dish while this one reviews.
    menu.dishes.push(dishOf(32, TACOS.id, "Campechano", 9000, 1));
    menu.draftVersion = 8;
    press(t("publish.submit"));
    expect(
      await screen.findByText(t("publish.problem.draftChanged")),
    ).toBeTruthy();
    expect(
      await screen.findByRole("heading", { level: 4, name: "Campechano" }),
    ).toBeTruthy();

    press(t("publish.submit"));
    expect(
      await screen.findByText(
        t("publish.done.other", { version: 3, count: 2 }),
      ),
    ).toBeTruthy();
    const [first, second] = calls();
    expect([first?.request.draftVersion, second?.request.draftVersion]).toEqual(
      [7, 8],
    );
    expect(second?.key).not.toBe(first?.key);
  });

  it("asks a lost answer again with the same key, so it never publishes twice", async () => {
    const menu = menuWith();
    const { api, calls } = await review(menu);
    const publish = api.publishBusinessMenu.getMockImplementation()!;
    // It published, but the answer never arrived.
    api.publishBusinessMenu.mockImplementationOnce(async (...args) => {
      await publish(...args);
      throw new ApiError({ kind: "network" });
    });
    press(t("publish.submit"));
    expect(
      await screen.findByText(t("publish.problem.unavailable")),
    ).toBeTruthy();

    press(t("publish.submit"));
    expect(
      await screen.findByText(
        t("publish.done.other", { version: 3, count: 2 }),
      ),
    ).toBeTruthy();
    const [first, second] = calls();
    expect(second?.key).toBe(first?.key);
    expect(menu.publishedVersion).toBe(3);
  });

  it("takes a new key after one the API refused for another request", async () => {
    const { api, calls } = await review(menuWith());
    api.publishBusinessMenu.mockRejectedValueOnce(
      httpError(422, "IDEMPOTENCY_KEY_REUSED"),
    );
    press(t("publish.submit"));
    expect(
      await screen.findByText(t("publish.problem.keyReused")),
    ).toBeTruthy();
    press(t("publish.submit"));
    expect(
      await screen.findByText(
        t("publish.done.other", { version: 3, count: 2 }),
      ),
    ).toBeTruthy();
    const [first, second] = calls();
    expect(second?.key).not.toBe(first?.key);
  });

  it("needs the profile before publishing, and says a menu no branch shows yet", async () => {
    const menu = menuWith({ profile: null });
    const { api } = await review(menu);
    expect(screen.getByText(t("publish.noProfile"))).toBeTruthy();
    press(t("publish.submit"));
    await settled();
    expect(api.publishBusinessMenu).not.toHaveBeenCalled();
    cleanup();

    const { api: alone } = fakeAdminApi({
      signedIn: actor(),
      world: { ...world(menuWith()), branches: [] },
    });
    renderAdmin(alone, MENU);
    fireEvent.click(
      await screen.findByRole("button", { name: t("publish.review") }),
    );
    press(t("publish.submit"));
    expect(
      await screen.findByText(t("publish.done.none", { version: 3 })),
    ).toBeTruthy();
  });

  it("still says what a conflict overwrites when the branches cannot be named", async () => {
    const menu = menuWith({ conflicts: [PRICE] });
    const { api } = fakeAdminApi({ signedIn: actor(), world: world(menu) });
    api.branches.mockRejectedValue(httpError(503, "SERVICE_UNAVAILABLE"));
    renderAdmin(api, MENU);
    fireEvent.click(
      await screen.findByRole("button", { name: t("publish.review") }),
    );
    const unnamed = t("publish.conflict.price", {
      branch: t("publish.unknownBranch"),
      dish: "Pastor",
      price: "$95.00",
    });
    expect(await screen.findByLabelText(unnamed)).toBeTruthy();
  });
});
