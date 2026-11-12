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
