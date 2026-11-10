import type { MenuImage, Profile } from '@miramenu/contracts';
import { composeMenu, referencedMedia } from './compose-menu';
import type {
  BaseSnapshot,
  BranchSnapshot,
  MediaState,
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

const IMAGE: MenuImage = {
  width: 960,
  height: 720,
  sources: [{ width: 960, url: 'https://media.example.test/a.webp' }],
};
const READY_IMAGE: MediaState = {
  status: 'ready',
  kind: 'image',
  image: IMAGE,
};
const READY_VIDEO: MediaState = {
  status: 'ready',
  kind: 'video',
  video: {
    url: 'https://media.example.test/a.mp4',
    width: 720,
    height: 1280,
    durationMs: 8000,
    poster: IMAGE,
  },
};
const NO_MEDIA = new Map<string, MediaState>();

const BUSINESS_PROFILE: Profile = {
  name: 'La Fonda',
  socialLinks: [],
  logoId: null,
};
const BRANCH_PROFILE: Profile = {
  name: 'La Fonda Centro',
  socialLinks: [],
  logoId: null,
};

interface Case {
  base: BaseSnapshot;
  branch: BranchSnapshot;
  media: Map<string, MediaState>;
}

function randomCase(seed: number): Case {
  const random = generator(seed);
  // Each medium is ready (of either kind), pending or failed, at random.
  const media = new Map<string, MediaState>();
  const mediaIds = Array.from({ length: 6 }, (_, i) => uuid('f', i));
  for (const id of mediaIds) {
    media.set(
      id,
      random.pick([
        READY_IMAGE,
        READY_VIDEO,
        { status: 'pending' },
        { status: 'failed' },
      ] as const),
    );
  }
  const maybeMedium = () => (random.chance(0.5) ? random.pick(mediaIds) : null);
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
    imageId: maybeMedium(),
    videoId: maybeMedium(),
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
    base: {
      profile: { ...BUSINESS_PROFILE, logoId: maybeMedium() },
      categories,
      dishes,
    },
    branch: {
      profile: random.chance(0.5)
        ? { ...BRANCH_PROFILE, logoId: maybeMedium() }
        : null,
      overrides,
      dishes: own,
    },
    media,
  };
}

const RUNS = 300;
const cases = Array.from({ length: RUNS }, (_, seed) => randomCase(seed + 1));
const servedDishes = (menu: ReturnType<typeof composeMenu>) =>
  menu.content.categories.flatMap((category) => category.dishes);

describe('composeMenu properties (ADR-0003, ADR-0036)', () => {
  it('never serves a dish that is not in a published snapshot', () => {
    for (const { base, branch, media } of cases) {
      const published = new Set([
        ...base.dishes.map((dish) => dish.id),
        ...branch.dishes.map((dish) => dish.id),
      ]);
      for (const dish of servedDishes(composeMenu(base, branch, media))) {
        expect(published.has(dish.id)).toBe(true);
      }
    }
  });

  it('never serves a dish the branch hid', () => {
    for (const { base, branch, media } of cases) {
      const hidden = new Set(
        branch.overrides.filter((o) => o.hidden).map((o) => o.dishId),
      );
      for (const dish of servedDishes(composeMenu(base, branch, media))) {
        expect(hidden.has(dish.id)).toBe(false);
      }
    }
  });

  it('serves every visible base dish exactly once, at the branch price when it has one', () => {
    for (const { base, branch, media } of cases) {
      const served = servedDishes(composeMenu(base, branch, media));
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
    for (const { base, branch, media } of cases) {
      const menu = composeMenu(base, branch, media);
      const publishedCategories = new Set(base.categories.map((c) => c.id));
      for (const own of branch.dishes) {
        const where = menu.content.categories.filter((category) =>
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
    for (const { base, branch, media } of cases) {
      const menu = composeMenu(base, branch, media);
      const positions = menu.content.categories.map(
        (category) =>
          base.categories.find((c) => c.id === category.id)?.position ?? -1,
      );
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
      for (const category of menu.content.categories) {
        expect(category.dishes.length).toBeGreaterThan(0);
      }
    }
  });

  it("uses the branch's own profile, or its business's when it has none", () => {
    for (const { base, branch, media } of cases) {
      const { name } = branch.profile ?? base.profile;
      expect(composeMenu(base, branch, media).content.profile.name).toBe(name);
    }
  });
});

describe('composeMenu media properties (ADR-0015)', () => {
  it('serves a medium only when it is ready and of the kind its slot expects', () => {
    for (const { base, branch, media } of cases) {
      const composed = composeMenu(base, branch, media);
      const sources = new Map(
        [...base.dishes, ...branch.dishes].map((dish) => [dish.id, dish]),
      );
      for (const dish of servedDishes(composed)) {
        const source = sources.get(dish.id);
        const image = source?.imageId ? media.get(source.imageId) : undefined;
        const video = source?.videoId ? media.get(source.videoId) : undefined;
        const isReady = (state: MediaState | undefined, kind: string) =>
          state?.status === 'ready' && state.kind === kind;
        expect(dish.image !== null).toBe(isReady(image, 'image'));
        expect(dish.video !== null).toBe(isReady(video, 'video'));
      }
    }
  });

  it('lists as pending exactly the served media that are not ready yet', () => {
    for (const { base, branch, media } of cases) {
      const composed = composeMenu(base, branch, media);
      const served = new Set(servedDishes(composed).map((dish) => dish.id));
      const profile = branch.profile ?? base.profile;
      const expected = new Set<string>();
      for (const dish of [...base.dishes, ...branch.dishes]) {
        if (!served.has(dish.id)) continue;
        for (const id of [dish.imageId, dish.videoId]) {
          if (id && media.get(id)?.status === 'pending') expected.add(id);
        }
      }
      if (profile.logoId && media.get(profile.logoId)?.status === 'pending') {
        expected.add(profile.logoId);
      }
      expect(composed.pendingMedia).toEqual([...expected].sort());
    }
  });

  it('references every medium of both snapshots', () => {
    for (const { base, branch } of cases) {
      const referenced = new Set(referencedMedia(base, branch));
      for (const dish of [...base.dishes, ...branch.dishes]) {
        if (dish.imageId) expect(referenced.has(dish.imageId)).toBe(true);
        if (dish.videoId) expect(referenced.has(dish.videoId)).toBe(true);
      }
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
    imageId: null,
    videoId: null,
  };
  const base: BaseSnapshot = {
    profile: BUSINESS_PROFILE,
    categories: [category],
    dishes: [pastor],
  };
  const noBranch: BranchSnapshot = {
    profile: null,
    overrides: [],
    dishes: [],
  };

  it('keeps a free branch price of zero instead of falling back to the base price', () => {
    const menu = composeMenu(
      base,
      {
        ...noBranch,
        overrides: [
          { dishId: pastor.id, priceCents: 0, available: true, hidden: false },
        ],
      },
      NO_MEDIA,
    );
    expect(menu.content.categories[0].dishes[0].priceCents).toBe(0);
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
      noBranch,
      NO_MEDIA,
    );
    expect(menu.content.categories[0].dishes.map((dish) => dish.name)).toEqual([
      'Suadero',
      'Asada',
      'Pastor',
    ]);
  });

  it('serves the published fields of each dish, and nothing else', () => {
    const photo = uuid('f', 1);
    const video = uuid('f', 2);
    const menu = composeMenu(
      { ...base, dishes: [{ ...pastor, imageId: photo, videoId: video }] },
      noBranch,
      new Map<string, MediaState>([
        [photo, READY_IMAGE],
        [video, { status: 'pending' }],
      ]),
    );
    expect(menu).toEqual({
      content: {
        profile: { name: 'La Fonda', socialLinks: [], logo: null },
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
                image: IMAGE,
                video: null,
              },
            ],
          },
        ],
      },
      pendingMedia: [video],
    });
  });

  it('never resolves an image put where a video goes', () => {
    const photo = uuid('f', 1);
    const menu = composeMenu(
      { ...base, dishes: [{ ...pastor, videoId: photo }] },
      noBranch,
      new Map([[photo, READY_IMAGE]]),
    );
    expect(menu.content.categories[0].dishes[0].video).toBeNull();
  });
});
