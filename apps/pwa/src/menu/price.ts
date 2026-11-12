import type { MenuDish } from "@miramenu/contracts";
import { formatPrice } from "@miramenu/i18n";
import { t } from "../i18n";

/** What the diner reads as a dish's price: the price, or that it is unavailable today. */
export function priceLabel(dish: MenuDish): string {
  return dish.available
    ? formatPrice(dish.priceCents, dish.currency)
    : t("menu.dishUnavailable");
}
