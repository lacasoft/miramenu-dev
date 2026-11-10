import {
  findConflicts,
  overwriteAdjustments,
  unconfirmedConflicts,
} from './conflicts';
import type { BaseSnapshot, SnapshotOverride } from './menu-snapshot';

const BRANCH_1 = 'b1000000-0000-4000-8000-000000000001';
const BRANCH_2 = 'b2000000-0000-4000-8000-000000000001';
const DISH_A = 'da000000-0000-4000-8000-000000000001';
const DISH_B = 'db000000-0000-4000-8000-000000000001';

const publishedBase = (prices: Record<string, number>): BaseSnapshot => ({
  profile: { name: 'La Fonda', socialLinks: [], logoId: null },
  categories: [],
  dishes: Object.entries(prices).map(([id, priceCents]) => ({
    id,
    categoryId: 'c0000000-0000-4000-8000-000000000001',
    name: id,
    description: '',
    priceCents,
    currency: 'MXN',
    position: 0,
    imageId: null,
    videoId: null,
  })),
});

const override = (
  dishId: string,
  priceCents: number | null,
  flags: Partial<SnapshotOverride> = {},
): SnapshotOverride => ({
  dishId,
  priceCents,
  available: true,
  hidden: false,
  ...flags,
});

describe('findConflicts (ADR-0036)', () => {
  it('reports a branch price on a dish whose base price changed', () => {
    const conflicts = findConflicts({
      draftDishes: [{ id: DISH_A, priceCents: 3000, removed: false }],
      publishedBase: publishedBase({ [DISH_A]: 2500 }),
      branches: [
        { branchId: BRANCH_1, draft: [override(DISH_A, 2800)], published: [] },
        { branchId: BRANCH_2, draft: [], published: [] },
      ],
    });
    expect(conflicts).toEqual([
      { branchId: BRANCH_1, dishId: DISH_A, reason: 'price_changed' },
    ]);
  });

  it('also counts a branch price that is published but no longer in the draft', () => {
    const conflicts = findConflicts({
      draftDishes: [{ id: DISH_A, priceCents: 3000, removed: false }],
      publishedBase: publishedBase({ [DISH_A]: 2500 }),
      branches: [
        {
          branchId: BRANCH_1,
          draft: [override(DISH_A, null)],
          published: [override(DISH_A, 2800)],
        },
      ],
    });
    expect(conflicts).toHaveLength(1);
  });

  it('ignores adjustments that do not touch the price, and prices equal to the new base', () => {
    expect(
      findConflicts({
        draftDishes: [{ id: DISH_A, priceCents: 3000, removed: false }],
        publishedBase: publishedBase({ [DISH_A]: 2500 }),
        branches: [
          {
            branchId: BRANCH_1,
            draft: [override(DISH_A, null, { available: false })],
            published: [],
          },
          {
            branchId: BRANCH_2,
            draft: [override(DISH_A, 3000)],
            published: [],
          },
        ],
      }),
    ).toEqual([]);
  });

  it('ignores a branch price when the base price did not change', () => {
    expect(
      findConflicts({
        draftDishes: [{ id: DISH_A, priceCents: 2500, removed: false }],
        publishedBase: publishedBase({ [DISH_A]: 2500 }),
        branches: [
          {
            branchId: BRANCH_1,
            draft: [override(DISH_A, 2800)],
            published: [],
          },
        ],
      }),
    ).toEqual([]);
  });

  it('has nothing to compare against on the first publication', () => {
    expect(
      findConflicts({
        draftDishes: [{ id: DISH_A, priceCents: 3000, removed: false }],
        publishedBase: null,
        branches: [
          {
            branchId: BRANCH_1,
            draft: [override(DISH_A, 2800)],
            published: [],
          },
        ],
      }),
    ).toEqual([]);
  });

  it('reports any adjustment of a removed dish, once per branch', () => {
    const conflicts = findConflicts({
      draftDishes: [{ id: DISH_B, priceCents: 1000, removed: true }],
      publishedBase: publishedBase({ [DISH_B]: 1000 }),
      branches: [
        {
          branchId: BRANCH_2,
          draft: [override(DISH_B, null, { hidden: true })],
          published: [override(DISH_B, null, { hidden: true })],
        },
        { branchId: BRANCH_1, draft: [], published: [override(DISH_B, 900)] },
      ],
    });
    expect(conflicts).toEqual([
      { branchId: BRANCH_1, dishId: DISH_B, reason: 'dish_removed' },
      { branchId: BRANCH_2, dishId: DISH_B, reason: 'dish_removed' },
    ]);
  });
});

describe('unconfirmedConflicts', () => {
  const conflicts = [
    { branchId: BRANCH_1, dishId: DISH_A, reason: 'price_changed' as const },
    { branchId: BRANCH_2, dishId: DISH_A, reason: 'price_changed' as const },
  ];

  it('is empty when the admin confirmed the whole list it saw', () => {
    expect(
      unconfirmedConflicts(conflicts, [
        { branchId: BRANCH_2, dishId: DISH_A },
        { branchId: BRANCH_1, dishId: DISH_A },
      ]),
    ).toEqual([]);
  });

  it('keeps a conflict that appeared after the admin looked', () => {
    expect(
      unconfirmedConflicts(conflicts, [{ branchId: BRANCH_1, dishId: DISH_A }]),
    ).toEqual([conflicts[1]]);
  });
});

describe('overwriteAdjustments', () => {
  it('drops the adjustment of a removed dish and resets a clashing price only', () => {
    const result = overwriteAdjustments(
      [
        override(DISH_A, 2800, { available: false }),
        override(DISH_B, 900),
        override('dc000000-0000-4000-8000-000000000001', 100),
      ],
      [
        { dishId: DISH_A, reason: 'price_changed' },
        { dishId: DISH_B, reason: 'dish_removed' },
      ],
    );
    expect(result).toEqual([
      override(DISH_A, null, { available: false }),
      override('dc000000-0000-4000-8000-000000000001', 100),
    ]);
  });
});
