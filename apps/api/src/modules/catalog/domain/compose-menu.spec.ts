import type { Profile } from '@miramenu/contracts';
import { composeMenu } from './compose-menu';
import type {
  BaseSnapshot,
  BranchSnapshot,
  SnapshotBranchDish,
  SnapshotDish,
} from './menu-snapshot';

/** mulberry32: a small seeded generator, so every property run is reproducible. */
function generator(seed: number) {
  let state = seed;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  return {
    int: (max: number) => Math.floor(next() * max),
    chance: (probability: number) => next() < probability,
    pick: <T>(items: readonly T[]) => items[Math.floor(next() * items.length)],
  };
}

const uuid = (prefix: string, n: number) =>
  `${prefix}${String(n).padStart(7, '0')}-0000-4000-8000-000000000000`;

const BUSINESS_PROFILE: Profile = { name: 'La Fonda', socialLinks: [] };
const BRANCH_PROFILE: Profile = { name: 'La Fonda Centro', socialLinks: [] };

function randomCase(seed: number): {
  base: BaseSnapshot;
  branch: BranchSnapshot;
} {
  const random = generator(seed);
  const categories = Array.from({ length: 1 + random.int(5) }, (_, i) => ({
    id: uuid('c', i),
    name: `Category ${random.int(3)}`,
    position: random.int(4),
  }));
  const dish = (
    prefix: string,
    i: number,
    categoryId: string,
  ): SnapshotDish => ({
    id: uuid(prefix, i),
    categoryId,
    name: `Dish ${random.int(5)}`,
    description: '',
    priceCents: random.int(50_000),
    currency: 'MXN',
    position: random.int(4),
  });
  const dishes = Array.from({ length: random.int(12) }, (_, i) =>
    dish('d', i, random.pick(categories).id),
  );
  const overrides = dishes
    .filter(() => random.chance(0.5))
    .map((base) => ({
      dishId: base.id,
      priceCents: random.chance(0.5) ? random.int(50_000) : null,
      available: random.chance(0.7),
      hidden: random.chance(0.3),
    }));
  // Some own dishes point to a category the business never published.
  const ownCategories = [...categories.map((c) => c.id), uuid('x', 1)];
  const own: SnapshotBranchDish[] = Array.from(
    { length: random.int(4) },
    (_, i) => ({
      ...dish('e', i, random.pick(ownCategories)),
      available: random.chance(0.7),
    }),
  );
  return {
    base: { profile: BUSINESS_PROFILE, categories, dishes },
    branch: {
      profile: random.chance(0.5) ? BRANCH_PROFILE : null,
      overrides,
      dishes: own,
    },
  };
}

const RUNS = 300;
const cases = Array.from({ length: RUNS }, (_, seed) => randomCase(seed + 1));
const servedDishes = (menu: ReturnType<typeof composeMenu>) =>
  menu.categories.flatMap((category) => category.dishes);

describe('composeMenu properties (ADR-0003, ADR-0036)', () => {
  it('never serves a dish that is not in a published snapshot', () => {
    for (const { base, branch } of cases) {
      const published = new Set([
        ...base.dishes.map((dish) => dish.id),
        ...branch.dishes.map((dish) => dish.id),
      ]);
      for (const dish of servedDishes(composeMenu(base, branch))) {
        expect(published.has(dish.id)).toBe(true);
      }
    }
  });

  it('never serves a dish the branch hid', () => {
    for (const { base, branch } of cases) {
      const hidden = new Set(
        branch.overrides.filter((o) => o.hidden).map((o) => o.dishId),
      );
      for (const dish of servedDishes(composeMenu(base, branch))) {
        expect(hidden.has(dish.id)).toBe(false);
      }
    }
  });

  it('serves every visible base dish exactly once, at the branch price when it has one', () => {
    for (const { base, branch } of cases) {
      const served = servedDishes(composeMenu(base, branch));
      for (const dish of base.dishes) {
        const override = branch.overrides.find((o) => o.dishId === dish.id);
        const copies = served.filter((s) => s.id === dish.id);
        if (override?.hidden) {
          expect(copies).toHaveLength(0);
          continue;
        }
        expect(copies).toHaveLength(1);
        expect(copies[0].priceCents).toBe(
          override?.priceCents ?? dish.priceCents,
        );
        expect(copies[0].available).toBe(override?.available ?? true);
      }
    }
  });

  it('serves own dishes only in categories the business published', () => {
    for (const { base, branch } of cases) {
      const menu = composeMenu(base, branch);
      const publishedCategories = new Set(base.categories.map((c) => c.id));
      for (const own of branch.dishes) {
        const where = menu.categories.filter((category) =>
          category.dishes.some((dish) => dish.id === own.id),
        );
        expect(where).toHaveLength(
          publishedCategories.has(own.categoryId) ? 1 : 0,
        );
        if (where.length === 1) expect(where[0].id).toBe(own.categoryId);
      }
    }
  });

  it('omits empty categories and keeps them in position order', () => {
    for (const { base, branch } of cases) {
      const menu = composeMenu(base, branch);
      const positions = menu.categories.map(
        (category) =>
          base.categories.find((c) => c.id === category.id)?.position ?? -1,
      );
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
      for (const category of menu.categories) {
        expect(category.dishes.length).toBeGreaterThan(0);
      }
    }
  });

  it("uses the branch's own profile, or its business's when it has none", () => {
    for (const { base, branch } of cases) {
      expect(composeMenu(base, branch).profile).toEqual(
        branch.profile ?? base.profile,
      );
    }
  });
});

describe('composeMenu', () => {
  const category = { id: uuid('c', 1), name: 'Tacos', position: 0 };
  const pastor: SnapshotDish = {
    id: uuid('d', 1),
    categoryId: category.id,
    name: 'Pastor',
    description: 'With pineapple',
    priceCents: 2500,
    currency: 'MXN',
    position: 1,
  };
  const base: BaseSnapshot = {
    profile: BUSINESS_PROFILE,
    categories: [category],
    dishes: [pastor],
  };

  it('keeps a free branch price of zero instead of falling back to the base price', () => {
    const menu = composeMenu(base, {
      profile: null,
      overrides: [
        { dishId: pastor.id, priceCents: 0, available: true, hidden: false },
      ],
      dishes: [],
    });
    expect(menu.categories[0].dishes[0].priceCents).toBe(0);
  });

  it('orders dishes by position, then name, the same on any server', () => {
    const suadero = {
      ...pastor,
      id: uuid('d', 2),
      name: 'Suadero',
      position: 0,
    };
    const asada = { ...pastor, id: uuid('d', 3), name: 'Asada', position: 1 };
    const menu = composeMenu(
      { ...base, dishes: [pastor, suadero, asada] },
      { profile: null, overrides: [], dishes: [] },
    );
    expect(menu.categories[0].dishes.map((dish) => dish.name)).toEqual([
      'Suadero',
      'Asada',
      'Pastor',
    ]);
  });

  it('serves the published fields of each dish, and nothing else', () => {
    const menu = composeMenu(base, {
      profile: null,
      overrides: [],
      dishes: [],
    });
    expect(menu).toEqual({
      profile: BUSINESS_PROFILE,
      categories: [
        {
          id: category.id,
          name: 'Tacos',
          dishes: [
            {
              id: pastor.id,
              name: 'Pastor',
              description: 'With pineapple',
              priceCents: 2500,
              currency: 'MXN',
              available: true,
            },
          ],
        },
      ],
    });
  });
});
