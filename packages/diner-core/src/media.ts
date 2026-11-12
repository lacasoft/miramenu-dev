import type { MenuDish } from "@miramenu/contracts";

export type MenuImage = NonNullable<MenuDish["image"]>;
export type MenuVideo = NonNullable<MenuDish["video"]>;

/** What a dish's scene plays: its video with a poster, its photo, or nothing yet. */
export type DishMedia =
  | { kind: "video"; video: MenuVideo; poster: MenuImage }
  | { kind: "image"; image: MenuImage }
  | { kind: "none" };

/** The feed plays the video when there is one; only ready media reach the menu (ADR-0015). */
export function dishMedia(dish: MenuDish): DishMedia {
  if (dish.video !== null)
    return { kind: "video", video: dish.video, poster: dish.video.poster };
  if (dish.image !== null) return { kind: "image", image: dish.image };
  return { kind: "none" };
}

/**
 * The still that stands for a dish in grids, the contextual bar and the detail: its
 * photo, chosen by the restaurant, or else its video's poster. Grids show covers,
 * never several videos at once (design-system: Retículas).
 */
export function coverOf(dish: MenuDish): MenuImage | null {
  return dish.image ?? dish.video?.poster ?? null;
}

/** The srcset of an optimized image, narrowest first, so the browser picks by width. */
export function srcSetOf(image: MenuImage): string {
  return [...image.sources]
    .sort((a, b) => a.width - b.width)
    .map((source) => `${source.url} ${source.width}w`)
    .join(", ");
}

/** The fallback src: the widest source, for browsers that ignore srcset. */
export function largestSourceOf(image: MenuImage): string {
  return [...image.sources].sort((a, b) => b.width - a.width)[0]?.url ?? "";
}
