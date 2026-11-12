import { PHONE_NUMBER_PLANS, phoneSchema } from "@miramenu/contracts";

/**
 * The phone in E.164 from what the diner typed: "55 1234 5678", "(55) 1234-5678" or
 * "+52 55 1234 5678" all give "+525512345678". Only the plans the API accepts (Mexico
 * today, RNF-06); anything else is null, so the form says so before asking for a code.
 */
export function phoneFromLocal(typed: string): string | null {
  const digits = typed.replace(/\D/g, "");
  for (const { prefix, digits: length } of PHONE_NUMBER_PLANS) {
    const country = prefix.slice(1);
    const local =
      digits.length === length
        ? digits
        : digits.length === country.length + length &&
            digits.startsWith(country)
          ? digits.slice(country.length)
          : null;
    if (local === null) continue;
    const phone = `${prefix}${local}`;
    if (phoneSchema.safeParse(phone).success) return phone;
  }
  return null;
}
