import {
  limitWaitSeconds,
  nextSendState,
  resendWaitSeconds,
  type SendState,
} from './send-policy';

describe('send policy', () => {
  const now = 1_000_000;

  describe('resendWaitSeconds', () => {
    it('lets the first code go at once', () => {
      expect(resendWaitSeconds(null, now, 60)).toBe(0);
    });

    it('makes the diner wait the rest of the 60 s, rounded up', () => {
      expect(
        resendWaitSeconds(
          { sentAtMs: now - 10_500, state: 'accepted' },
          now,
          60,
        ),
      ).toBe(50);
      expect(
        resendWaitSeconds(
          { sentAtMs: now - 60_000, state: 'accepted' },
          now,
          60,
        ),
      ).toBe(0);
    });

    it('waits on an unconfirmed send too: it may still arrive', () => {
      for (const state of ['unknown', 'sending', 'delivered', null] as const) {
        expect(
          resendWaitSeconds({ sentAtMs: now - 1000, state }, now, 60),
        ).toBe(59);
      }
    });

    it('does not wait on a send the provider reported failed', () => {
      expect(
        resendWaitSeconds({ sentAtMs: now - 1000, state: 'failed' }, now, 60),
      ).toBe(0);
    });
  });

  describe('nextSendState', () => {
    it('follows the reports until the send is delivered or failed', () => {
      expect(nextSendState('unknown', 'accepted')).toBe('accepted');
      expect(nextSendState('accepted', 'failed')).toBe('failed');
      expect(nextSendState('sending', 'delivered')).toBe('delivered');
    });

    it('never takes back a final state with a late report', () => {
      const finals: SendState[] = [
        'delivered',
        'failed',
        'rejected',
        'unavailable',
      ];
      for (const state of finals) {
        expect(nextSendState(state, 'accepted')).toBe(state);
      }
    });
  });

  describe('limitWaitSeconds', () => {
    it('is 0 while every count is within its limit', () => {
      expect(
        limitWaitSeconds([
          { count: 5, ttlMs: 1000, max: 5 },
          { count: 1, ttlMs: 1000, max: 10 },
        ]),
      ).toBe(0);
    });

    it('waits for the longest exceeded window, never less than a second', () => {
      expect(
        limitWaitSeconds([
          { count: 6, ttlMs: 3_600_400, max: 5 },
          { count: 31, ttlMs: 120_000, max: 30 },
          { count: 2, ttlMs: 9_000_000, max: 10 },
        ]),
      ).toBe(3601);
      expect(limitWaitSeconds([{ count: 2, ttlMs: 0, max: 1 }])).toBe(1);
    });
  });
});
