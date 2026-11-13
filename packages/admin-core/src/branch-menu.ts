import type {
  BranchDish,
  BranchMenuDraft,
  BusinessMenuDraft,
  Category,
  CreateBranchDishRequest,
  Dish,
  Override,
  PutOverrideRequest,
} from "@miramenu/contracts";
import {
  newDishOf,
  priceCentsOf,
  priceProblemOf,
  priceTextOf,
  type DishValues,
  type PriceProblem,
} from "./menu.ts";

/** A base dish as this branch serves it: its adjustment applied (ADR-0036). */
export interface AdjustedDish {
  dish: Dish;
  override: Override | null;
  priceCents: number;
  available: boolean;
  hidden: boolean;
}

export const adjustedOf = (
  dish: Dish,
  override: Override | null,
): AdjustedDish => ({
  dish,
  override,
  priceCents: override?.priceCents ?? dish.priceCents,
  available: override?.available ?? true,
  hidden: override?.hidden ?? false,
});

/** One category of the branch's menu: the base dishes with their adjustment, then its own. */
export interface BranchSection {
  category: Category;
  base: AdjustedDish[];
  own: BranchDish[];
}

/**
 * The branch's menu over its business's base draft, category by category in the base's
 * order. An adjustment of a dish the base removed has nothing to show and is left out:
 * publishing the base clears it.
 */
export function branchSectionsOf(
  base: Pick<BusinessMenuDraft, "categories" | "dishes">,
  branch: Pick<BranchMenuDraft, "overrides" | "dishes">,
): BranchSection[] {
  const overrides = new Map(
    branch.overrides.map((override) => [override.dishId, override]),
  );
  return base.categories.map((category) => ({
    category,
    base: base.dishes
      .filter((dish) => dish.categoryId === category.id)
      .map((dish) => adjustedOf(dish, overrides.get(dish.id) ?? null)),
    own: branch.dishes.filter((dish) => dish.categoryId === category.id),
  }));
}

/** An adjustment as its form holds it: an empty price keeps the base price. */
export interface AdjustmentValues {
  price: string;
  available: boolean;
  hidden: boolean;
}

export const adjustmentValuesOf = ({
  override,
  available,
  hidden,
}: AdjustedDish): AdjustmentValues => ({
  price: override?.priceCents == null ? "" : priceTextOf(override.priceCents),
  available,
  hidden,
});

/** The branch's own price is optional: empty is the base price. */
export const adjustmentPriceProblemOf = (text: string): PriceProblem | null =>
  text.trim() === "" ? null : priceProblemOf(text);

/** What saving an adjustment sends: the adjustment, taking it away, or nothing. */
export type AdjustmentChange =
  { kind: "put"; override: PutOverrideRequest } | { kind: "clear" } | null;

const sameOverride = (
  a: PutOverrideRequest | null,
  b: PutOverrideRequest | null,
) =>
  a === null || b === null
    ? a === b
    : a.priceCents === b.priceCents &&
      a.available === b.available &&
      a.hidden === b.hidden;

/**
 * The adjustment the form asks for, from a form without problems. A price equal to the
 * base price is no price of the branch's own; an adjustment that changes nothing of the
 * base dish is taken away instead of kept; one equal to the current is nothing to send.
 */
export function adjustmentOf(
  { dish, override }: AdjustedDish,
  values: AdjustmentValues,
): AdjustmentChange {
  const typed = values.price.trim() === "" ? null : priceCentsOf(values.price);
  const next: PutOverrideRequest | null = {
    priceCents: typed === dish.priceCents ? null : typed,
    available: values.available,
    hidden: values.hidden,
  };
  const wanted =
    next.priceCents === null && next.available && !next.hidden ? null : next;
  const current =
    override === null
      ? null
      : {
          priceCents: override.priceCents,
          available: override.available,
          hidden: override.hidden,
        };
  if (sameOverride(wanted, current)) return null;
  return wanted === null
    ? { kind: "clear" }
    : { kind: "put", override: wanted };
}

/** A dish of the branch alone, from a form without problems; available until it says otherwise. */
export const newBranchDishOf = (
  values: DishValues,
  currency: string,
): CreateBranchDishRequest => ({
  ...newDishOf(values, currency),
  available: true,
});

/** Every dish a category holds in this branch, base and own: where a moved own dish lands after. */
export const dishesInSection = (
  section: BranchSection,
): { id: string; position: number }[] => [
  ...section.base.map(({ dish }) => dish),
  ...section.own,
];
