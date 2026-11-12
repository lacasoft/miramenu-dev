import type {
  MenuCategory,
  MenuDish,
  PublishedMenu,
} from "@miramenu/contracts";

/** A dish as the screens show it: with its category, for the detail's kicker. */
export interface VisibleDish {
  dish: MenuDish;
  category: MenuCategory;
}

/** The category filter that applies: one the menu has, or none. */
export function effectiveCategoryId(
  menu: PublishedMenu,
  categoryId: string | null,
): string | null {
  return menu.categories.some((category) => category.id === categoryId)
    ? categoryId
    : null;
}

/** The dishes on screen, in the menu's order, read by rows in every density. */
export function visibleDishes(
  menu: PublishedMenu,
  categoryId: string | null,
): VisibleDish[] {
  const filter = effectiveCategoryId(menu, categoryId);
  return menu.categories
    .filter((category) => filter === null || category.id === filter)
    .flatMap((category) => category.dishes.map((dish) => ({ dish, category })));
}

/**
 * The active dish: the one the location names if it is visible, the first visible
 * otherwise. It survives every change of density (design-system: Retículas).
 */
export function activeDishOf(
  dishes: readonly VisibleDish[],
  dishId: string | null,
): VisibleDish | undefined {
  return dishes.find(({ dish }) => dish.id === dishId) ?? dishes[0];
}
