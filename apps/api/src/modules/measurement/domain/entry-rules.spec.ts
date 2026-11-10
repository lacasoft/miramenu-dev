import { isQuickSkip, judgeBatch, judgeEntry } from './entry-rules';

const receivedAt = new Date('2026-11-10T20:00:00.000Z');
const entry = (overrides: Record<string, unknown> = {}) => ({
  entryId: '0b6f1a52-7c64-4c4e-9a1e-1f2d3c4b5a69',
  branchId: '7f9c1d2e-3b4a-4c5d-8e6f-0a1b2c3d4e5f',
  dishId: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  enteredAt: '2026-11-10T19:59:00.000Z',
  exposureMs: 4200,
  validView: true,
  exit: 'auto',
  ...overrides,
});

describe('entry rules', () => {
  describe('isQuickSkip', () => {
    it('counts only manual skips under 2 s', () => {
      expect(isQuickSkip('manual', 1999)).toBe(true);
      expect(isQuickSkip('manual', 2000)).toBe(false);
      expect(isQuickSkip('auto', 100)).toBe(false);
      expect(isQuickSkip('abandoned', 100)).toBe(false);
    });
  });

  describe('judgeEntry', () => {
    it('accepts an entry of the last 7 days and derives its quick skip', () => {
      const verdict = judgeEntry(
        entry({ exit: 'manual', exposureMs: 800, validView: false }),
        receivedAt,
      );

      expect(verdict).toEqual({
        ok: true,
        entry: expect.objectContaining({
          enteredAt: new Date('2026-11-10T19:59:00.000Z'),
          quickSkip: true,
        }),
      });
    });

    it('refuses entries over 7 days late, or more than 5 min in the future', () => {
      expect(
        judgeEntry(
          entry({ enteredAt: '2026-11-03T19:59:59.999Z' }),
          receivedAt,
        ),
      ).toEqual({ ok: false, reason: 'too_late' });
      expect(
        judgeEntry(entry({ enteredAt: '2026-11-03T20:00:00.000Z' }), receivedAt)
          .ok,
      ).toBe(true);
      expect(
        judgeEntry(
          entry({ enteredAt: '2026-11-10T20:05:00.001Z' }),
          receivedAt,
        ),
      ).toEqual({ ok: false, reason: 'in_future' });
    });

    it('refuses what the contract refuses', () => {
      expect(
        judgeEntry(entry({ exposureMs: 500, validView: true }), receivedAt),
      ).toEqual({ ok: false, reason: 'invalid' });
      expect(judgeEntry('not an entry', receivedAt)).toEqual({
        ok: false,
        reason: 'invalid',
      });
    });
  });

  describe('judgeBatch', () => {
    it('answers each entry by its id, or its position when the id is unusable', () => {
      const second = entry({ entryId: '2c4e6a8b-0d1f-4a3c-9e5b-7d9f1b3d5f7a' });
      const { accepted, receipt } = judgeBatch(
        [
          entry(),
          entry({ exposureMs: -1 }),
          { entryId: 'nope' },
          second,
          entry({ enteredAt: '2026-01-01T00:00:00.000Z' }),
        ],
        receivedAt,
      );

      expect(accepted.map((item) => item.entryId)).toEqual([
        entry().entryId,
        second.entryId,
      ]);
      expect(receipt).toEqual({
        accepted: [entry().entryId, second.entryId],
        rejected: [
          { index: 1, entryId: entry().entryId, reason: 'invalid' },
          { index: 2, entryId: null, reason: 'invalid' },
          { index: 4, entryId: entry().entryId, reason: 'too_late' },
        ],
      });
    });

    it('counts an id repeated in the same batch once', () => {
      const { accepted, receipt } = judgeBatch([entry(), entry()], receivedAt);

      expect(accepted).toHaveLength(1);
      expect(receipt.rejected).toEqual([
        { index: 1, entryId: entry().entryId, reason: 'repeated_in_batch' },
      ]);
    });
  });
});
