import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MenuDish, PublishedMenu } from "@miramenu/contracts";
import {
  coverOf,
  dishMedia,
  largestSourceOf,
  srcSetOf,
  type MenuImage,
} from "./media.ts";
import {
  activeDishOf,
  effectiveCategoryId,
  visibleDishes,
} from "./menu-view.ts";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const image = (base: string): MenuImage => ({
  width: 960,
  height: 960,
  sources: [
    { width: 960, url: `https://cdn.test/${base}-960.webp` },
    { width: 480, url: `https://cdn.test/${base}-480.webp` },
  ],
});

const dish = (n: number, media: Partial<MenuDish> = {}): MenuDish => ({
  id: id(n),
  name: `Platillo ${n}`,
  description: "",
  priceCents: 1000 * n,
  currency: "MXN",
  available: true,
  image: null,
  video: null,
  ...media,
});

const MENU: PublishedMenu = {
  branchId: id(900),
  version: 1,
  publishedAt: "2026-11-12T18:00:00.000Z",
  profile: { name: "La Fonda", socialLinks: [], logo: null },
  categories: [
    { id: id(100), name: "Tacos", dishes: [dish(1), dish(2)] },
    { id: id(200), name: "Bebidas", dishes: [dish(3)] },
  ],
};

describe("visibleDishes", () => {
  it("lists every dish in the menu's order, each with its category", () => {
    assert.deepEqual(
      visibleDishes(MENU, null).map(({ dish, category }) => [
        dish.id,
        category.name,
      ]),
      [
        [id(1), "Tacos"],
        [id(2), "Tacos"],
        [id(3), "Bebidas"],
      ],
    );
  });

  it("keeps only the filtered category, and ignores one the menu lacks", () => {
    assert.deepEqual(
      visibleDishes(MENU, id(200)).map(({ dish }) => dish.id),
      [id(3)],
    );
    assert.equal(visibleDishes(MENU, id(999)).length, 3);
    assert.equal(effectiveCategoryId(MENU, id(999)), null);
    assert.equal(effectiveCategoryId(MENU, id(100)), id(100));
  });
});

describe("activeDishOf", () => {
  it("keeps the named dish while it is visible, and falls to the first otherwise", () => {
    const all = visibleDishes(MENU, null);
    assert.equal(activeDishOf(all, id(2))?.dish.id, id(2));
    assert.equal(
      activeDishOf(visibleDishes(MENU, id(200)), id(2))?.dish.id,
      id(3),
    );
    assert.equal(activeDishOf(all, null)?.dish.id, id(1));
    assert.equal(activeDishOf([], id(1)), undefined);
  });
});

describe("dish media", () => {
  const video = {
    url: "https://cdn.test/v.mp4",
    width: 720,
    height: 1280,
    durationMs: 28_000,
    poster: image("poster"),
  };

  it("plays the video when there is one, with its poster", () => {
    assert.deepEqual(dishMedia(dish(1, { video, image: image("photo") })), {
      kind: "video",
      video,
      poster: video.poster,
    });
    assert.deepEqual(dishMedia(dish(1, { image: image("photo") })), {
      kind: "image",
      image: image("photo"),
    });
    assert.deepEqual(dishMedia(dish(1)), { kind: "none" });
  });

  it("covers a dish with its photo first, then the video's poster", () => {
    assert.deepEqual(
      coverOf(dish(1, { video, image: image("photo") })),
      image("photo"),
    );
    assert.deepEqual(coverOf(dish(1, { video })), video.poster);
    assert.equal(coverOf(dish(1)), null);
  });

  it("offers every width to the browser, narrowest first", () => {
    assert.equal(
      srcSetOf(image("photo")),
      "https://cdn.test/photo-480.webp 480w, https://cdn.test/photo-960.webp 960w",
    );
    assert.equal(
      largestSourceOf(image("photo")),
      "https://cdn.test/photo-960.webp",
    );
  });
});
