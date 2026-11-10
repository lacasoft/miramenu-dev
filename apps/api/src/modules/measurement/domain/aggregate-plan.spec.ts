import { aggregateDeltas, hourOf } from './aggregate-plan';

const branch = '7f9c1d2e-3b4a-4c5d-8e6f-0a1b2c3d4e5f';
const dishA = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const dishB = '0a1b2c3d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

const entry = (
  dishId: string,
  enteredAt: string,
  fields: {
    exposureMs?: number;
    validView?: boolean;
    quickSkip?: boolean;
  } = {},
) => ({
  branchId: branch,
  dishId,
  enteredAt: new Date(enteredAt),
  exposureMs: fields.exposureMs ?? 3000,
  validView: fields.validView ?? true,
  quickSkip: fields.quickSkip ?? false,
});

describe('aggregate plan', () => {
  it('truncates to the UTC hour', () => {
    expect(hourOf(new Date('2026-11-10T19:59:59.999Z'))).toEqual(
      new Date('2026-11-10T19:00:00.000Z'),
    );
  });

  it('adds each entry to its own dish and hour, exposure only with a valid view', () => {
    const deltas = aggregateDeltas([
      entry(dishA, '2026-11-10T19:10:00Z', { exposureMs: 4000 }),
      entry(dishA, '2026-11-10T19:50:00Z', {
        exposureMs: 800,
        validView: false,
        quickSkip: true,
      }),
      entry(dishA, '2026-11-10T20:01:00Z'),
      entry(dishB, '2026-11-10T19:30:00Z', { exposureMs: 1500 }),
    ]);

    expect(deltas).toEqual([
      {
        branchId: branch,
        dishId: dishB,
        hour: new Date('2026-11-10T19:00:00Z'),
        entries: 1,
        views: 1,
        exposureMs: 1500,
        quickSkips: 0,
      },
      {
        branchId: branch,
        dishId: dishA,
        hour: new Date('2026-11-10T19:00:00Z'),
        entries: 2,
        views: 1,
        exposureMs: 4000,
        quickSkips: 1,
      },
      {
        branchId: branch,
        dishId: dishA,
        hour: new Date('2026-11-10T20:00:00Z'),
        entries: 1,
        views: 1,
        exposureMs: 3000,
        quickSkips: 0,
      },
    ]);
  });

  it('always lists the rows in the same order, whatever the order of the entries', () => {
    const entries = [
      entry(dishA, '2026-11-10T20:01:00Z'),
      entry(dishB, '2026-11-10T19:30:00Z'),
      entry(dishA, '2026-11-10T19:10:00Z'),
    ];

    expect(aggregateDeltas([...entries].reverse())).toEqual(
      aggregateDeltas(entries),
    );
  });
});
