/** Locale of the diner's texts and formats: Mexico only today (RNF-06). */
export const DINER_LOCALE = "es-MX";

/**
 * A price kept in the currency's minor unit (centavos for MXN), formatted for the locale.
 * The minor unit comes from Intl, so a currency without decimals is not divided by 100.
 */
export function formatPrice(
  minorUnits: number,
  currency: string,
  locale: string = DINER_LOCALE,
): string {
  const format = new Intl.NumberFormat(locale, { style: "currency", currency });
  const decimals = format.resolvedOptions().maximumFractionDigits ?? 2;
  return format.format(minorUnits / 10 ** decimals);
}

/** A video's length as minutes and seconds, "0:28" or "1:05", for the grid's badge. */
export function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

const RELATIVE_UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/** How long ago something happened, "hace 3 horas", in the locale; "ahora" under a minute. */
export function formatRelativeTime(
  when: string,
  now: number,
  locale: string = DINER_LOCALE,
): string {
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const seconds = Math.round((Date.parse(when) - now) / 1000);
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return format.format(0, "second");
}

/** A count with the locale's grouping: "1,284". */
export const formatCount = (value: number, locale: string = DINER_LOCALE): string =>
  new Intl.NumberFormat(locale).format(value);

/** A share of 0 to 1 as a percentage: "37 %" or "37%", as the locale writes it. */
export const formatPercent = (ratio: number, locale: string = DINER_LOCALE): string =>
  new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(ratio);

/** A change against before, always signed and never "−0": "+12 %", "−8 %". */
export const formatSignedPercent = (ratio: number, locale: string = DINER_LOCALE): string =>
  new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0, signDisplay: "exceptZero" }).format(
    ratio,
  );

/** A time in seconds with one decimal: "3.4 s". */
export const formatSeconds = (milliseconds: number, locale: string = DINER_LOCALE): string =>
  `${new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(milliseconds / 1000)} s`;

/** A calendar day, `YYYY-MM-DD`, as a short label: "13 nov". */
export function formatShortDay(date: string, locale: string = DINER_LOCALE): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" })
    .format(Date.UTC(year!, month! - 1, day!))
    .replace(".", "");
}
