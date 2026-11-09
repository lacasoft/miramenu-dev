import {
  remainingWaitSeconds,
  waitAfterFailures,
} from './login-throttle-policy';

describe('waitAfterFailures (ADR-0021)', () => {
  it('lets the first four failures through without waiting', () => {
    expect([0, 1, 2, 3, 4].map(waitAfterFailures)).toEqual([0, 0, 0, 0, 0]);
  });

  it('doubles the wait from the fifth failure: 1 s, 2 s, 4 s, 8 s…', () => {
    expect([5, 6, 7, 8, 9].map(waitAfterFailures)).toEqual([1, 2, 4, 8, 16]);
  });

  it('never waits more than 15 minutes', () => {
    expect(waitAfterFailures(15)).toBe(900);
    expect(waitAfterFailures(1000)).toBe(900);
  });
});

describe('remainingWaitSeconds', () => {
  const lastFailureAt = 1_000_000;

  it('is zero while no wait applies or once it has passed', () => {
    expect(remainingWaitSeconds(4, lastFailureAt, lastFailureAt)).toBe(0);
    expect(remainingWaitSeconds(6, lastFailureAt, lastFailureAt + 2000)).toBe(
      0,
    );
  });

  it('rounds the remaining wait up to whole seconds', () => {
    expect(remainingWaitSeconds(6, lastFailureAt, lastFailureAt)).toBe(2);
    expect(remainingWaitSeconds(6, lastFailureAt, lastFailureAt + 1500)).toBe(
      1,
    );
  });
});
