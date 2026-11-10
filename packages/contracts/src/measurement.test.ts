import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FEED_ENTRY_LIMITS,
  feedEntryBatchSchema,
  feedEntrySchema,
  metricsQuerySchema,
} from "./measurement.ts";

const accepts = (
  schema: { safeParse(value: unknown): { success: boolean } },
  value: unknown,
) => schema.safeParse(value).success;

const entry = {
  entryId: "0b6f1a52-7c64-4c4e-9a1e-1f2d3c4b5a69",
  branchId: "7f9c1d2e-3b4a-4c5d-8e6f-0a1b2c3d4e5f",
  dishId: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
  enteredAt: "2026-11-10T14:03:21.512-06:00",
  exposureMs: 4200,
  validView: true,
  exit: "auto",
};

describe("feedEntrySchema", () => {
  it("takes a closed entry with its measures", () => {
    assert.equal(accepts(feedEntrySchema, entry), true);
    for (const exit of ["manual", "auto", "abandoned"]) {
      assert.equal(accepts(feedEntrySchema, { ...entry, exit }), true, exit);
    }
  });

  it("refuses a valid view under 1 s, and exposure beyond its cap", () => {
    assert.equal(
      accepts(feedEntrySchema, { ...entry, exposureMs: 999, validView: true }),
      false,
    );
    assert.equal(
      accepts(feedEntrySchema, { ...entry, exposureMs: 999, validView: false }),
      true,
    );
    assert.equal(
      accepts(feedEntrySchema, {
        ...entry,
        exposureMs: FEED_ENTRY_LIMITS.maxExposureMs + 1,
      }),
      false,
    );
  });

  it("refuses unknown exits and fields, like a quick skip the client decided", () => {
    assert.equal(accepts(feedEntrySchema, { ...entry, exit: "swipe" }), false);
    assert.equal(
      accepts(feedEntrySchema, { ...entry, quickSkip: true }),
      false,
    );
  });
});

describe("feedEntryBatchSchema", () => {
  it("takes 1 to 100 entries from one device, checked one by one later", () => {
    const deviceId = "9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b";
    assert.equal(
      accepts(feedEntryBatchSchema, { deviceId, entries: [entry] }),
      true,
    );
    assert.equal(
      accepts(feedEntryBatchSchema, { deviceId, entries: ["anything"] }),
      true,
    );
    assert.equal(
      accepts(feedEntryBatchSchema, { deviceId, entries: [] }),
      false,
    );
    assert.equal(
      accepts(feedEntryBatchSchema, {
        deviceId,
        entries: Array.from({ length: 101 }, () => entry),
      }),
      false,
    );
    assert.equal(accepts(feedEntryBatchSchema, { entries: [entry] }), false);
  });
});

describe("metricsQuerySchema", () => {
  it("takes whole hours in order, and defaults to Mexico City's time zone", () => {
    const query = metricsQuerySchema.parse({
      from: "2026-11-01T06:00:00Z",
      to: "2026-11-08T06:00:00Z",
    });
    assert.equal(query.timeZone, "America/Mexico_City");
    assert.equal(
      accepts(metricsQuerySchema, {
        from: "2026-11-01T00:00:00-06:00",
        to: "2026-11-02T00:00:00-06:00",
        timeZone: "America/Tijuana",
      }),
      true,
    );
  });

  it("refuses partial hours, reversed or too long periods and unknown zones", () => {
    for (const query of [
      { from: "2026-11-01T06:30:00Z", to: "2026-11-02T06:00:00Z" },
      { from: "2026-11-02T06:00:00Z", to: "2026-11-01T06:00:00Z" },
      { from: "2026-11-01T06:00:00Z", to: "2026-11-01T06:00:00Z" },
      { from: "2025-01-01T00:00:00Z", to: "2026-11-01T00:00:00Z" },
      {
        from: "2026-11-01T06:00:00Z",
        to: "2026-11-02T06:00:00Z",
        timeZone: "Mars/Olympus",
      },
    ]) {
      assert.equal(
        accepts(metricsQuerySchema, query),
        false,
        JSON.stringify(query),
      );
    }
  });
});
