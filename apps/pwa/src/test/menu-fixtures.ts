import type { MenuDish, PublishedMenu } from "@miramenu/contracts";

// The branch the menu's tests walk through: two categories, a still, a video, an
// unavailable dish without media and a drink.

export const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const image = (name: string) => ({
  width: 960,
  height: 960,
  sources: [{ width: 960, url: `https://cdn.example.test/${name}.webp` }],
});

export const dish = (
  n: number,
  name: string,
  extra: Partial<MenuDish> = {},
): MenuDish => ({
  id: id(n),
  name,
  description: `Descripción de ${name}`,
  priceCents: 2500,
  currency: "MXN",
  available: true,
  image: image(name),
  video: null,
  ...extra,
});

export const PASTOR = dish(1, "Pastor");
export const SUADERO = dish(2, "Suadero", {
  image: null,
  video: {
    url: "https://cdn.example.test/suadero.mp4",
    width: 720,
    height: 1280,
    durationMs: 28_000,
    poster: image("suadero-poster"),
  },
});
export const GRINGA = dish(3, "Gringa", { available: false, image: null });
export const HORCHATA = dish(4, "Horchata", { priceCents: 3000 });

export const MENU: PublishedMenu = {
  branchId: id(900),
  version: 1,
  publishedAt: "2026-11-12T18:00:00.000Z",
  profile: {
    name: "La Fonda",
    socialLinks: [
      { network: "instagram", url: "https://instagram.com/lafonda" },
    ],
    logo: null,
  },
  categories: [
    { id: id(100), name: "Tacos", dishes: [PASTOR, SUADERO, GRINGA] },
    { id: id(200), name: "Bebidas", dishes: [HORCHATA] },
  ],
};

export const TIMINGS = { stillMs: 5000, holdMs: 10_000 };
