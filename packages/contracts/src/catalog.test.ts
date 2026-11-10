import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createBranchDishRequestSchema,
  createDishRequestSchema,
  currencySchema,
  idempotencyKeySchema,
  MENU_LIMITS,
  priceCentsSchema,
  putProfileRequestSchema,
  publishBusinessMenuRequestSchema,
  putOverrideRequestSchema,
  updateCategoryRequestSchema,
  updateDishRequestSchema,
} from "./catalog.ts";

const accepts = (
  schema: { safeParse(value: unknown): { success: boolean } },
  value: unknown,
) => schema.safeParse(value).success;

const categoryId = "6f1c2b8e-3d4a-4f5b-9c6d-7e8f9a0b1c2d";
const dish = {
  categoryId,
  name: "Tacos al pastor",
  priceCents: 8900,
  currency: "MXN",
};

describe("priceCentsSchema", () => {
  it("takes whole cents from zero up to the cap", () => {
    for (const value of [0, 1, 8900, 10_000_000]) {
      assert.equal(accepts(priceCentsSchema, value), true, String(value));
    }
  });

  it("refuses fractions of a cent, negatives and amounts over the cap", () => {
    for (const value of [89.5, -1, 10_000_001, "8900", Number.NaN]) {
      assert.equal(accepts(priceCentsSchema, value), false, String(value));
    }
  });
});

describe("currencySchema", () => {
  it("takes ISO 4217 codes only", () => {
    assert.equal(accepts(currencySchema, "MXN"), true);
    for (const value of ["mxn", "MX", "MXNN", "$"]) {
      assert.equal(accepts(currencySchema, value), false, value);
    }
  });
});

describe("putProfileRequestSchema", () => {
  it("takes HTTPS social links only", () => {
    const withLink = (url: string) => ({
      name: "La Fonda",
      socialLinks: [{ network: "instagram", url }],
    });
    assert.equal(
      accepts(putProfileRequestSchema, withLink("https://instagram.com/lafonda")),
      true,
    );
    for (const url of [
      "http://instagram.com/lafonda",
      "javascript:alert(1)",
      "ftp://example.com",
    ]) {
      assert.equal(accepts(putProfileRequestSchema, withLink(url)), false, url);
    }
  });

  it("bounds the number of links and refuses unknown networks", () => {
    const link = { network: "website", url: "https://lafonda.mx" };
    assert.equal(
      accepts(putProfileRequestSchema, {
        name: "La Fonda",
        socialLinks: Array(MENU_LIMITS.socialLinks + 1).fill(link),
      }),
      false,
    );
    assert.equal(
      accepts(putProfileRequestSchema, {
        name: "La Fonda",
        socialLinks: [{ network: "myspace", url: "https://myspace.com/x" }],
      }),
      false,
    );
  });

  it("defaults to no logo, and takes a medium id or null", () => {
    const base = { name: "La Fonda", socialLinks: [] };
    assert.equal(putProfileRequestSchema.parse(base).logoId, null);
    assert.equal(
      accepts(putProfileRequestSchema, { ...base, logoId: categoryId }),
      true,
    );
    assert.equal(
      accepts(putProfileRequestSchema, { ...base, logoId: "logo.png" }),
      false,
    );
  });

  it("refuses a blank name", () => {
    assert.equal(
      accepts(putProfileRequestSchema, { name: "   ", socialLinks: [] }),
      false,
    );
  });
});

describe("dish requests", () => {
  it("defaults the description to empty and the dish to no media", () => {
    const parsed = createDishRequestSchema.parse(dish);
    assert.equal(parsed.description, "");
    assert.equal(parsed.position, undefined);
    assert.equal(parsed.imageId, null);
    assert.equal(parsed.videoId, null);
  });

  it("detaches a medium with null and leaves it alone when omitted", () => {
    assert.deepEqual(updateDishRequestSchema.parse({ videoId: null }), {
      videoId: null,
    });
    assert.equal(
      "imageId" in updateDishRequestSchema.parse({ priceCents: 1 }),
      false,
    );
  });

  it("refuses fields that are not part of the contract", () => {
    assert.equal(
      accepts(createDishRequestSchema, { ...dish, businessId: categoryId }),
      false,
    );
    assert.equal(
      accepts(createBranchDishRequestSchema, { ...dish, branchId: categoryId }),
      false,
    );
  });

  it("gives a branch's own dish its availability, available by default", () => {
    assert.equal(createBranchDishRequestSchema.parse(dish).available, true);
    assert.equal(
      createBranchDishRequestSchema.parse({ ...dish, available: false })
        .available,
      false,
    );
  });

  it("refuses an update that changes nothing", () => {
    assert.equal(accepts(updateDishRequestSchema, {}), false);
    assert.equal(accepts(updateCategoryRequestSchema, {}), false);
    assert.equal(accepts(updateDishRequestSchema, { priceCents: 9900 }), true);
  });
});

describe("putOverrideRequestSchema", () => {
  it("needs every field, with null meaning the base price", () => {
    assert.equal(
      accepts(putOverrideRequestSchema, {
        priceCents: null,
        available: false,
        hidden: false,
      }),
      true,
    );
    assert.equal(
      accepts(putOverrideRequestSchema, { available: false, hidden: false }),
      false,
    );
  });
});

describe("publication", () => {
  it("defaults the confirmed conflicts to none", () => {
    const parsed = publishBusinessMenuRequestSchema.parse({ draftVersion: 3 });
    assert.deepEqual(parsed.confirmedConflicts, []);
  });

  it("bounds the confirmed conflicts", () => {
    const ref = { branchId: categoryId, dishId: categoryId };
    assert.equal(
      accepts(publishBusinessMenuRequestSchema, {
        draftVersion: 1,
        confirmedConflicts: Array(MENU_LIMITS.confirmedConflicts + 1).fill(ref),
      }),
      false,
    );
  });

  it("takes idempotency keys of 16 to 128 URL-safe characters", () => {
    assert.equal(
      accepts(idempotencyKeySchema, "0b6f1c2e-3d4a-4f5b-9c6d-7e8f9a0b1c2d"),
      true,
    );
    for (const key of [
      "short",
      "a".repeat(129),
      "with spaces in it here",
      "",
    ]) {
      assert.equal(accepts(idempotencyKeySchema, key), false, key);
    }
  });
});
