import { addMeasures, NO_MEASURES, ratesOf } from './metrics-math';

describe('metrics math', () => {
  it('adds measures, missing ones as zero', () => {
    expect(
      addMeasures(
        { ...NO_MEASURES, entries: 2, likes: 1 },
        { entries: 3, views: 2, exposureMs: 5000 },
      ),
    ).toEqual({
      ...NO_MEASURES,
      entries: 5,
      views: 2,
      exposureMs: 5000,
      likes: 1,
    });
  });

  it('divides sums, and gives null instead of 0 without a denominator', () => {
    expect(
      ratesOf({
        ...NO_MEASURES,
        entries: 4,
        views: 2,
        exposureMs: 7000,
        quickSkips: 1,
      }),
    ).toEqual({ exposureAverageMs: 3500, quickSkipRate: 0.25 });
    expect(ratesOf(NO_MEASURES)).toEqual({
      exposureAverageMs: null,
      quickSkipRate: null,
    });
    expect(ratesOf({ ...NO_MEASURES, entries: 3 })).toEqual({
      exposureAverageMs: null,
      quickSkipRate: 0,
    });
  });
});
