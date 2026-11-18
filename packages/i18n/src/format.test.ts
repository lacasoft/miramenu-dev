import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatCount,
  formatDuration,
  formatPercent,
  formatPrice,
  formatRelativeTime,
  formatSeconds,
  formatShortDay,
  formatSignedPercent,
} from "./format.ts";

describe("formatPrice", () => {
  it("formats centavos as pesos for Mexico", () => {
    assert.equal(formatPrice(2500, "MXN"), "$25.00");
    assert.equal(formatPrice(123_456, "MXN"), "$1,234.56");
    assert.equal(formatPrice(0, "MXN"), "$0.00");
  });

  it("uses each currency's own minor unit", () => {
    // Intl separates the code with a no-break space; \s matches it.
    assert.match(formatPrice(150, "USD"), /^USD\s1\.50$/);
    // The yen has no decimals: 500 minor units are ¥500, not ¥5.
    assert.match(formatPrice(500, "JPY"), /500$/);
  });
});

describe("formatDuration", () => {
  it("shows minutes and two-digit seconds, rounded to the nearest second", () => {
    assert.equal(formatDuration(28_000), "0:28");
    assert.equal(formatDuration(65_400), "1:05");
    assert.equal(formatDuration(59_600), "1:00");
    assert.equal(formatDuration(0), "0:00");
    assert.equal(formatDuration(-5), "0:00");
  });
});

describe("formatRelativeTime", () => {
  const NOW = Date.parse("2026-11-12T18:00:00Z");
  const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();

  it("says how long ago, in the largest unit that fits", () => {
    assert.equal(formatRelativeTime(ago(20), NOW), "ahora");
    assert.equal(formatRelativeTime(ago(5 * 60), NOW), "hace 5 minutos");
    assert.equal(formatRelativeTime(ago(3 * 3600), NOW), "hace 3 horas");
    assert.equal(formatRelativeTime(ago(24 * 3600), NOW), "ayer");
    assert.equal(formatRelativeTime(ago(14 * 24 * 3600), NOW), "hace 2 semanas");
  });
});

describe("the dashboard's figures, for Mexico", () => {
  it("groups counts and writes shares as percentages", () => {
    assert.equal(formatCount(1284), "1,284");
    assert.equal(formatCount(0), "0");
    assert.equal(formatPercent(0.375), new Intl.NumberFormat("es-MX", { style: "percent" }).format(0.38));
    assert.match(formatPercent(0.375), /^38\s?%$/);
  });

  it("signs a change, and never shows minus zero", () => {
    assert.match(formatSignedPercent(0.2), /^\+20\s?%$/);
    assert.match(formatSignedPercent(-0.084), /^-8\s?%$/);
    assert.match(formatSignedPercent(0), /^0\s?%$/);
    assert.match(formatSignedPercent(-0.001), /^-?0\s?%$/);
  });

  it("writes an average exposure in seconds with one decimal, and a day short", () => {
    assert.equal(formatSeconds(3412), "3.4 s");
    assert.equal(formatSeconds(0), "0.0 s");
    assert.equal(formatShortDay("2026-11-13"), "13 nov");
    assert.equal(formatShortDay("2026-01-02"), "2 ene");
  });
});
