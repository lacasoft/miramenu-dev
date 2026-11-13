import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BranchDish, Dish, Override, SessionActor } from "@miramenu/contracts";
import { canOperateBranch } from "./access.ts";
import {
  adjustedOf,
  adjustmentOf,
  adjustmentPriceProblemOf,
  adjustmentValuesOf,
  branchSectionsOf,
  dishesInSection,
  newBranchDishOf,
} from "./branch-menu.ts";
import { attemptOf, publishProblemOf, rereadsDraft } from "./publication.ts";
import { hrefOf, routeOf } from "./routes.ts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const dish = (n: number, categoryId: string, priceCents = 9500): Dish => ({
  id: id(n),
  categoryId,
  name: `Platillo ${n}`,
  description: "",
  priceCents,
  currency: "MXN",
  imageId: null,
  videoId: null,
  position: n,
});
const override = (dishId: string, extra: Partial<Override> = {}): Override => ({
  dishId,
  priceCents: null,
  available: true,
  hidden: false,
  ...extra,
});
const actor = (roles: SessionActor["roles"], isSuperadmin = false): SessionActor => ({
  user: { id: id(1), email: "ana@lafonda.example", name: "Ana" },
  isSuperadmin,
  roles,
});

describe("a branch's menu page", () => {
  it("lives under its branch, with the id checked", () => {
    const route = { screen: "branchMenu", branchId: id(11) } as const;
    assert.deepEqual(routeOf({ pathname: `/branches/${id(11)}/menu`, search: "" }), route);
    assert.equal(hrefOf(route), `/branches/${id(11)}/menu`);
    assert.deepEqual(routeOf({ pathname: "/branches/x/menu", search: "" }), { screen: "notFound" });
    assert.deepEqual(routeOf({ pathname: `/branches/${id(11)}/menu/x`, search: "" }), { screen: "notFound" });
  });

  it("is changed by its own admin, its business's admin and the superadmin, not a sibling's", () => {
    const branch = { id: id(11), businessId: id(10) };
    assert.equal(canOperateBranch(actor([{ businessId: id(10), branchId: id(11), role: "branch_admin" }]), branch), true);
    assert.equal(canOperateBranch(actor([{ businessId: id(10), branchId: null, role: "business_admin" }]), branch), true);
    assert.equal(canOperateBranch(actor([], true), branch), true);
    assert.equal(canOperateBranch(actor([{ businessId: id(10), branchId: id(12), role: "branch_admin" }]), branch), false);
    assert.equal(canOperateBranch(actor([{ businessId: id(20), branchId: null, role: "business_admin" }]), branch), false);
  });
});

describe("the branch over its base menu (ADR-0036)", () => {
  const tacos = { id: id(20), name: "Tacos", position: 0 };
  const bebidas = { id: id(21), name: "Bebidas", position: 1 };
  const own: BranchDish = { ...dish(40, tacos.id, 7000), name: "Gringa", available: true };

  it("lays each base dish with its adjustment, then the branch's own, category by category", () => {
    const sections = branchSectionsOf(
      { categories: [tacos, bebidas], dishes: [dish(30, tacos.id), dish(31, bebidas.id, 3000)] },
      { overrides: [override(id(30), { priceCents: 9000 }), override(id(99), { hidden: true })], dishes: [own] },
    );
    assert.deepEqual(
      sections.map((section) => [section.category.name, section.base.map((each) => [each.dish.id, each.priceCents]), section.own.map((each) => each.name)]),
      [
        ["Tacos", [[id(30), 9000]], ["Gringa"]],
        ["Bebidas", [[id(31), 3000]], []],
      ],
    );
    assert.deepEqual(dishesInSection(sections[0]!).map((each) => each.id), [id(30), id(40)]);
  });

  it("serves a base dish as its adjustment says, and as it is without one", () => {
    assert.deepEqual(adjustedOf(dish(30, tacos.id), null), { dish: dish(30, tacos.id), override: null, priceCents: 9500, available: true, hidden: false });
    const adjusted = adjustedOf(dish(30, tacos.id), override(id(30), { available: false, hidden: true }));
    assert.equal(adjusted.priceCents, 9500);
    assert.equal(adjusted.available, false);
    assert.equal(adjusted.hidden, true);
  });

  it("fills its form with the branch's own price, empty for the base price", () => {
    assert.deepEqual(adjustmentValuesOf(adjustedOf(dish(30, tacos.id), null)), { price: "", available: true, hidden: false });
    assert.deepEqual(adjustmentValuesOf(adjustedOf(dish(30, tacos.id), override(id(30), { priceCents: 9000, available: false }))), {
      price: "90.00",
      available: false,
      hidden: false,
    });
    assert.equal(adjustmentPriceProblemOf(""), null);
    assert.equal(adjustmentPriceProblemOf("90,5"), "format");
  });

  it("sends the adjustment, takes away one that changes nothing, and sends nothing when nothing changed", () => {
    const plain = adjustedOf(dish(30, tacos.id), null);
    assert.equal(adjustmentOf(plain, { price: "", available: true, hidden: false }), null);
    assert.equal(adjustmentOf(plain, { price: "95", available: true, hidden: false }), null);
    assert.deepEqual(adjustmentOf(plain, { price: "90", available: false, hidden: false }), {
      kind: "put",
      override: { priceCents: 9000, available: false, hidden: false },
    });
    const sold = adjustedOf(dish(30, tacos.id), override(id(30), { available: false }));
    assert.deepEqual(adjustmentOf(sold, { price: "", available: true, hidden: false }), { kind: "clear" });
    assert.equal(adjustmentOf(sold, { price: "", available: false, hidden: false }), null);
    assert.deepEqual(adjustmentOf(sold, { price: "95.00", available: false, hidden: true }), {
      kind: "put",
      override: { priceCents: null, available: false, hidden: true },
    });
  });

  it("creates the branch's own dish available, in the business's currency", () => {
    assert.deepEqual(newBranchDishOf({ name: " Gringa ", description: "", price: "70", categoryId: tacos.id }, "MXN"), {
      categoryId: tacos.id,
      name: "Gringa",
      description: "",
      priceCents: 7000,
      currency: "MXN",
      available: true,
    });
  });
});

describe("publishing a branch", () => {
  it("says what a refused branch publication means", () => {
    const http = (status: number, code: string) => ({ kind: "http", status, code });
    assert.equal(publishProblemOf(http(409, "BASE_MENU_NOT_PUBLISHED")), "baseNotPublished");
    assert.equal(publishProblemOf(http(409, "CATEGORY_NOT_PUBLISHED")), "categoryNotPublished");
    assert.equal(rereadsDraft("baseNotPublished"), false);
    assert.equal(rereadsDraft("draftChanged"), true);
  });

  it("keeps the key with a branch's request too", () => {
    let n = 0;
    const freshKey = () => `key_${String((n += 1)).padStart(16, "0")}`;
    const first = attemptOf(null, { draftVersion: 2 }, freshKey);
    assert.equal(attemptOf(first, { draftVersion: 2 }, freshKey), first);
    assert.notEqual(attemptOf(first, { draftVersion: 3 }, freshKey).key, first.key);
  });
});
