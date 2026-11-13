import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PublicationConflict } from "@miramenu/contracts";
import {
  currencyOf,
  descriptionProblemOf,
  dishUpdateOf,
  endPositionOf,
  menuProblemOf,
  moveOf,
  newDishOf,
  priceCentsOf,
  priceProblemOf,
  priceTextOf,
  menuSectionsOf,
  socialUrlProblemOf,
} from "./menu.ts";
import {
  attemptOf,
  conflictKeyOf,
  keepsAttempt,
  publicationOf,
  publishProblemOf,
  rereadsDraft,
} from "./publication.ts";
import { hrefOf, routeOf } from "./routes.ts";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const http = (status: number, code = "X") => ({ kind: "http", status, code });

describe("the base menu's page", () => {
  it("lives under its business, with the id checked", () => {
    const route = { screen: "menu", businessId: id(10) } as const;
    assert.deepEqual(
      routeOf({ pathname: `/businesses/${id(10)}/menu`, search: "" }),
      route,
    );
    assert.equal(hrefOf(route), `/businesses/${id(10)}/menu`);
    assert.deepEqual(routeOf({ pathname: "/businesses/x/menu", search: "" }), {
      screen: "notFound",
    });
    assert.deepEqual(
      routeOf({ pathname: `/businesses/${id(10)}/menu/x`, search: "" }),
      { screen: "notFound" },
    );
  });
});

describe("prices as the admin types them", () => {
  it("reads pesos with up to two decimals, a sign and thousands in groups of three", () => {
    const cases: [string, number][] = [
      ["85", 8500],
      ["85.5", 8550],
      ["85.50", 8550],
      ["0", 0],
      ["0.05", 5],
      ["$ 1,250.00", 125000],
      ["1250", 125000],
      [" 12.30 ", 1230],
      ["100000", 10_000_000],
    ];
    for (const [text, cents] of cases) {
      assert.equal(priceProblemOf(text), null, text);
      assert.equal(priceCentsOf(text), cents, text);
    }
  });

  it("counts cents on the digits, never through a float", () => {
    assert.equal(priceCentsOf("0.29"), 29);
    assert.equal(priceCentsOf("1.15"), 115);
    assert.equal(priceCentsOf("4.35"), 435);
  });

  it("says what is wrong before anything is sent", () => {
    const cases: [string, string][] = [
      ["", "required"],
      ["  ", "required"],
      ["-5", "format"],
      ["85.505", "format"],
      ["85,5", "format"],
      ["1,25.00", "format"],
      [".50", "format"],
      ["abc", "format"],
      ["1e3", "format"],
      ["100000.01", "tooHigh"],
      ["1,000,000", "tooHigh"],
    ];
    for (const [text, problem] of cases)
      assert.equal(priceProblemOf(text), problem, text);
    assert.throws(() => priceCentsOf("abc"));
    assert.throws(() => priceCentsOf("100000.01"));
  });

  it("shows a price to edit as plain digits with two decimals, read back the same", () => {
    for (const cents of [0, 5, 50, 8550, 125000, 10_000_000]) {
      assert.equal(priceCentsOf(priceTextOf(cents)), cents);
    }
    assert.equal(priceTextOf(125005), "1250.05");
  });
});

describe("the fields of a dish and a profile", () => {
  it("takes up to 500 characters of description, trimmed", () => {
    assert.equal(descriptionProblemOf(""), null);
    assert.equal(descriptionProblemOf(`${"a".repeat(500)}   `), null);
    assert.equal(descriptionProblemOf("a".repeat(501)), "tooLong");
  });

  it("takes only https addresses for social links", () => {
    assert.equal(socialUrlProblemOf("https://instagram.com/lafonda"), null);
    assert.equal(socialUrlProblemOf(""), "required");
    assert.equal(socialUrlProblemOf("http://instagram.com/lafonda"), "format");
    assert.equal(socialUrlProblemOf("instagram.com/lafonda"), "format");
  });

  it("prices in the currency of the business's country, and guesses none for another", () => {
    assert.equal(currencyOf("MX"), "MXN");
    assert.equal(currencyOf("US"), null);
  });
});

describe("what a dish's form sends", () => {
  const dish = {
    id: id(30),
    categoryId: id(20),
    name: "Pastor",
    description: "Con piña",
    priceCents: 8550,
    currency: "MXN",
    imageId: id(40),
    videoId: null,
    position: 2,
  };
  const values = { name: "Pastor", description: "Con piña", price: "85.50", categoryId: id(20) };

  it("creates a dish trimmed, in cents, in the business's currency", () => {
    assert.deepEqual(newDishOf({ name: " Pastor ", description: "  ", price: "85.5", categoryId: id(20) }, "MXN"), {
      categoryId: id(20),
      name: "Pastor",
      description: "",
      priceCents: 8550,
      currency: "MXN",
    });
  });

  it("sends only what changed, and nothing when nothing did", () => {
    assert.equal(dishUpdateOf(dish, values, []), null);
    assert.equal(dishUpdateOf(dish, { ...values, name: " Pastor ", price: "85.5" }, []), null);
    assert.deepEqual(dishUpdateOf(dish, { ...values, price: "90" }, []), { priceCents: 9000 });
    assert.deepEqual(dishUpdateOf(dish, { ...values, name: "Pastor de trompo", description: "" }, []), {
      name: "Pastor de trompo",
      description: "",
    });
  });

  it("puts a dish that changes category after the last one there, leaving its media alone", () => {
    assert.deepEqual(dishUpdateOf(dish, { ...values, categoryId: id(21) }, [{ id: id(31), position: 4 }]), {
      categoryId: id(21),
      position: 5,
    });
  });
});

describe("the order of categories and dishes", () => {
  const items = (...positions: number[]) =>
    positions.map((position, index) => ({ id: `i${index}`, position }));

  it("swaps two neighbors with their own positions", () => {
    assert.deepEqual(moveOf(items(0, 1, 2), "i1", 1), [
      { id: "i1", position: 2 },
      { id: "i2", position: 1 },
    ]);
    assert.deepEqual(moveOf(items(0, 4, 9), "i2", -1), [
      { id: "i2", position: 4 },
      { id: "i1", position: 9 },
    ]);
  });

  it("renumbers a list with ties, so the move lands where it was asked", () => {
    // i1 and i2 tie at 1: i3 goes between them and i2, already at 2, keeps its place.
    assert.deepEqual(moveOf(items(0, 1, 1, 2), "i3", -1), [{ id: "i2", position: 3 }]);
    assert.deepEqual(moveOf(items(0, 0), "i0", 1), [{ id: "i0", position: 1 }]);
  });

  it("moves nothing past either end, nor what is not there", () => {
    assert.deepEqual(moveOf(items(0, 1), "i0", -1), []);
    assert.deepEqual(moveOf(items(0, 1), "i1", 1), []);
    assert.deepEqual(moveOf(items(0, 1), "nope", 1), []);
  });

  it("puts a dish that changes category after the last one there", () => {
    assert.equal(endPositionOf([]), 0);
    assert.equal(endPositionOf(items(3, 0, 7)), 8);
    assert.equal(endPositionOf(items(10_000)), 10_000);
  });

  it("groups the dishes under their categories, both in the API's order", () => {
    const categories = [
      { id: "c1", name: "Tacos", position: 0 },
      { id: "c2", name: "Bebidas", position: 1 },
    ];
    const dish = (dishId: string, categoryId: string) => ({
      id: dishId,
      categoryId,
      name: dishId,
      description: "",
      priceCents: 0,
      currency: "MXN",
      imageId: null,
      videoId: null,
      position: 0,
    });
    const sections = menuSectionsOf({
      categories,
      dishes: [dish("d1", "c2"), dish("d2", "c1"), dish("d3", "c2")],
    });
    assert.deepEqual(
      sections.map((section) => [
        section.category.id,
        section.dishes.map((each) => each.id),
      ]),
      [
        ["c1", ["d2"]],
        ["c2", ["d1", "d3"]],
      ],
    );
  });

  it("says what a refused change means", () => {
    assert.equal(menuProblemOf(http(409, "MENU_LIMIT_REACHED")), "limit");
    assert.equal(menuProblemOf(http(409, "CATEGORY_IN_USE")), "categoryInUse");
    assert.equal(
      menuProblemOf(http(404, "CATEGORY_NOT_FOUND")),
      "categoryGone",
    );
    assert.equal(menuProblemOf(http(404, "NOT_FOUND")), "gone");
    assert.equal(menuProblemOf(http(403, "FORBIDDEN")), "forbidden");
    assert.equal(menuProblemOf(http(400, "VALIDATION_FAILED")), "invalid");
    assert.equal(
      menuProblemOf(http(503, "SERVICE_UNAVAILABLE")),
      "unavailable",
    );
    assert.equal(menuProblemOf({ kind: "network" }), "unavailable");
  });
});

describe("publishing the base menu (ADR-0036)", () => {
  const conflict = (
    branch: number,
    dish: number,
    reason: PublicationConflict["reason"],
  ): PublicationConflict => ({
    branchId: id(branch),
    dishId: id(dish),
    reason,
    dishName: `Platillo ${dish}`,
  });
  const conflicts = [
    conflict(20, 30, "price_changed"),
    conflict(21, 31, "dish_removed"),
  ];

  it("sends the reviewed version with the confirmed conflicts as plain references", () => {
    const all = new Set(conflicts.map(conflictKeyOf));
    assert.deepEqual(publicationOf({ draftVersion: 7, conflicts }, all), {
      request: {
        draftVersion: 7,
        confirmedConflicts: [
          { branchId: id(20), dishId: id(30) },
          { branchId: id(21), dishId: id(31) },
        ],
      },
      missing: 0,
    });
  });

  it("counts the conflicts left unconfirmed, and drops confirmations of ones that are gone", () => {
    const stale = new Set([
      conflictKeyOf(conflicts[0]!),
      conflictKeyOf(conflict(22, 32, "price_changed")),
    ]);
    const { request, missing } = publicationOf(
      { draftVersion: 7, conflicts },
      stale,
    );
    assert.deepEqual(request.confirmedConflicts, [
      { branchId: id(20), dishId: id(30) },
    ]);
    assert.equal(missing, 1);
  });

  it("asks again for a conflict whose reason changed", () => {
    const confirmed = new Set([
      conflictKeyOf(conflict(20, 30, "price_changed")),
    ]);
    assert.equal(
      publicationOf(
        { draftVersion: 1, conflicts: [conflict(20, 30, "dish_removed")] },
        confirmed,
      ).missing,
      1,
    );
  });

  it("keeps the key with its request, and takes a new one for another request", () => {
    let n = 0;
    const freshKey = () => `key_${String((n += 1)).padStart(16, "0")}`;
    const request = { draftVersion: 3, confirmedConflicts: [] };
    const first = attemptOf(null, request, freshKey);
    assert.equal(
      attemptOf(first, { draftVersion: 3, confirmedConflicts: [] }, freshKey),
      first,
    );
    const changed = attemptOf(
      first,
      { draftVersion: 4, confirmedConflicts: [] },
      freshKey,
    );
    assert.notEqual(changed.key, first.key);
    const confirmedMore = attemptOf(
      changed,
      {
        draftVersion: 4,
        confirmedConflicts: [{ branchId: id(20), dishId: id(30) }],
      },
      freshKey,
    );
    assert.notEqual(confirmedMore.key, changed.key);
  });

  it("says what a refused publication means, and what to do next", () => {
    const cases: [
      ReturnType<typeof http> | { kind: string },
      string,
      boolean,
      boolean,
    ][] = [
      [http(409, "DRAFT_CHANGED"), "draftChanged", false, true],
      [http(409, "PUBLICATION_CONFLICTS"), "conflictsChanged", false, true],
      [http(409, "PROFILE_REQUIRED"), "profileRequired", false, true],
      [http(422, "IDEMPOTENCY_KEY_REUSED"), "keyReused", false, false],
      [http(403, "FORBIDDEN"), "forbidden", false, false],
      [http(404, "NOT_FOUND"), "notFound", false, false],
      [http(400, "VALIDATION_FAILED"), "invalid", false, false],
      [http(503, "SERVICE_UNAVAILABLE"), "unavailable", true, false],
      [{ kind: "network" }, "unavailable", true, false],
      [{ kind: "unexpected", status: 201 }, "unavailable", true, false],
    ];
    for (const [failure, problem, keeps, rereads] of cases) {
      const found = publishProblemOf(failure);
      assert.equal(found, problem, JSON.stringify(failure));
      assert.equal(keepsAttempt(found), keeps, problem);
      assert.equal(rereadsDraft(found), rereads, problem);
    }
  });
});
