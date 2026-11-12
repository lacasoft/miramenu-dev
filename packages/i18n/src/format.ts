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
