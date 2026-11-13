import {
  PRICE_CENTS_MAX,
  socialLinkSchema,
  type BusinessMenuDraft,
  type Category,
  type CreateDishRequest,
  type Dish,
  type UpdateDishRequest,
} from "@miramenu/contracts";
import type { CallFailure } from "./failures.ts";
import type { FieldProblem } from "./forms.ts";

/**
 * A price as the admin types it, in units of its currency with up to two decimals:
 * "85", "85.5", "$1,250.00". Thousands go with commas in groups of three, or not at all.
 */
const PRICE = /^\$?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/;

export type PriceProblem = "required" | "format" | "tooHigh";

const priceParts = (text: string) => PRICE.exec(text.trim());

/** In cents, counted on the digits, never through a float (0.1 + 0.2 is not 0.3). */
const centsOf = (match: RegExpExecArray) =>
  Number(match[1]!.replaceAll(",", "")) * 100 +
  Number((match[2] ?? "").padEnd(2, "0"));

export function priceProblemOf(text: string): PriceProblem | null {
  if (text.trim() === "") return "required";
  const match = priceParts(text);
  if (match === null) return "format";
  return centsOf(match) > PRICE_CENTS_MAX ? "tooHigh" : null;
}

/** The cents of a price that has no problem; anything else is a programming error. */
export function priceCentsOf(text: string): number {
  const match = priceParts(text);
  if (match === null || priceProblemOf(text) !== null)
    throw new Error("not a price");
  return centsOf(match);
}

/** A price as the form shows it to edit: plain digits and two decimals, "1250.00". */
export const priceTextOf = (cents: number): string =>
  `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;

const DESCRIPTION_MAX = 500;

export const descriptionProblemOf = (text: string): FieldProblem | null =>
  text.trim().length > DESCRIPTION_MAX ? "tooLong" : null;

/** A social link goes to an https address (the contract's rule). */
export function socialUrlProblemOf(url: string): FieldProblem | null {
  if (url.trim() === "") return "required";
  return socialLinkSchema.shape.url.safeParse(url.trim()).success
    ? null
    : "format";
}

/**
 * The currency of a business's prices, by its country. Only Mexico today; a country
 * without one has none to guess (RNF-06).
 */
const CURRENCIES: Readonly<Record<string, string>> = { MX: "MXN" };

export const currencyOf = (country: string): string | null =>
  CURRENCIES[country] ?? null;

/** One category of the draft with its dishes, both in the order diners will see them. */
export interface MenuSection {
  category: Category;
  dishes: Dish[];
}

/** The draft as the menu reads: each category, in order, with its dishes in order. */
export const menuSectionsOf = (
  draft: Pick<BusinessMenuDraft, "categories" | "dishes">,
): MenuSection[] =>
  draft.categories.map((category) => ({
    category,
    dishes: draft.dishes.filter((dish) => dish.categoryId === category.id),
  }));

interface Positioned {
  id: string;
  position: number;
}

/** A new position for one item. */
export interface PositionChange {
  id: string;
  position: number;
}

/**
 * The position changes that move one item a place up (-1) or down (+1) in a list kept
 * in order. Two neighbors with their own positions swap them. A tie with anyone (the API
 * then orders by name) renumbers the list, so the move lands where the admin asked.
 */
export function moveOf(
  items: readonly Positioned[],
  id: string,
  offset: -1 | 1,
): PositionChange[] {
  const from = items.findIndex((item) => item.id === id);
  const to = from + offset;
  if (from < 0 || to < 0 || to >= items.length) return [];
  const moving = items[from]!;
  const other = items[to]!;
  const positions = items.map((item) => item.position);
  const tied = new Set(positions).size < positions.length;
  if (!tied)
    return [
      { id: moving.id, position: other.position },
      { id: other.id, position: moving.position },
    ];
  const order = [...items];
  order.splice(from, 1);
  order.splice(to, 0, moving);
  return order.flatMap((item, index) =>
    item.position === index ? [] : [{ id: item.id, position: index }],
  );
}

const POSITION_MAX = 10_000;

/** After the last item: where a dish lands when it moves to another category. */
export const endPositionOf = (items: readonly Positioned[]): number =>
  Math.min(
    POSITION_MAX,
    items.reduce((last, item) => Math.max(last, item.position + 1), 0),
  );

/** A dish as its form holds it: the price still as typed. */
export interface DishValues {
  name: string;
  description: string;
  price: string;
  categoryId: string;
}

/** A new dish from a form without problems; it lands after the last one of its category. */
export const newDishOf = (values: DishValues, currency: string): CreateDishRequest => ({
  categoryId: values.categoryId,
  name: values.name.trim(),
  description: values.description.trim(),
  priceCents: priceCentsOf(values.price),
  currency,
});

/**
 * Only what changed goes to the API; nothing changed is nothing to send. A dish that moves
 * to another category goes after the last one there (`dishesThere`).
 */
export function dishUpdateOf(
  dish: Dish,
  values: DishValues,
  dishesThere: readonly Positioned[],
): UpdateDishRequest | null {
  const name = values.name.trim();
  const description = values.description.trim();
  const priceCents = priceCentsOf(values.price);
  const moves = values.categoryId !== dish.categoryId;
  const update: UpdateDishRequest = {
    ...(name === dish.name ? {} : { name }),
    ...(description === dish.description ? {} : { description }),
    ...(priceCents === dish.priceCents ? {} : { priceCents }),
    ...(moves ? { categoryId: values.categoryId, position: endPositionOf(dishesThere) } : {}),
  };
  return Object.keys(update).length === 0 ? null : update;
}

/** What the API's answer to a change of the menu means for the admin. */
export type MenuProblem =
  | "limit"
  | "categoryInUse"
  | "categoryGone"
  | "gone"
  | "forbidden"
  | "invalid"
  | "unavailable";

const MENU_CODES: Readonly<Record<string, MenuProblem>> = {
  MENU_LIMIT_REACHED: "limit",
  CATEGORY_IN_USE: "categoryInUse",
  CATEGORY_NOT_FOUND: "categoryGone",
};

export function menuProblemOf(failure: CallFailure): MenuProblem {
  if (failure.kind !== "http") return "unavailable";
  const known =
    failure.code === undefined ? undefined : MENU_CODES[failure.code];
  if (known !== undefined) return known;
  if (failure.status === 404) return "gone";
  if (failure.status === 403) return "forbidden";
  if (failure.status === 400) return "invalid";
  return "unavailable";
}
