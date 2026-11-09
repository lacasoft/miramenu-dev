import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pageQuerySchema, pageSchema } from "./pagination.ts";
import { z } from "zod";

describe("pageQuerySchema", () => {
  it("defaults to 20 items and no cursor", () => {
    assert.deepEqual(pageQuerySchema.parse({}), { limit: 20 });
  });

  it("accepts a limit from the query string, up to 50", () => {
    assert.equal(pageQuerySchema.parse({ limit: "50" }).limit, 50);
    assert.equal(pageQuerySchema.parse({ limit: "1" }).limit, 1);
  });

  it("rejects limits outside 1..50 and non-integers", () => {
    for (const limit of ["0", "51", "-1", "2.5", "abc"]) {
      assert.equal(pageQuerySchema.safeParse({ limit }).success, false, limit);
    }
  });

  it("rejects a cursor with characters outside base64url", () => {
    assert.equal(
      pageQuerySchema.safeParse({ cursor: "abc/def" }).success,
      false,
    );
    assert.equal(pageQuerySchema.safeParse({ cursor: "" }).success, false);
    assert.equal(
      pageQuerySchema.safeParse({ cursor: "eyJhIjoxfQ" }).success,
      true,
    );
  });

  it("rejects unknown query parameters", () => {
    assert.equal(pageQuerySchema.safeParse({ offset: "20" }).success, false);
  });
});

describe("pageSchema", () => {
  it("describes a page of items with the next cursor or null at the end", () => {
    const page = pageSchema(z.strictObject({ id: z.string() }));
    assert.equal(
      page.safeParse({ items: [{ id: "a" }], nextCursor: null }).success,
      true,
    );
    assert.equal(
      page.safeParse({ items: [], nextCursor: "eyJhIjoxfQ" }).success,
      true,
    );
    assert.equal(page.safeParse({ items: [] }).success, false);
  });
});
