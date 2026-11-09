import { cursorSchema } from '@miramenu/contracts';
import { decodeCursor, encodeCursor, toPage } from './keyset-cursor';
import { RequestValidationException } from './request-validation';

const position = {
  createdAt: new Date('2026-11-10T12:34:56.789Z'),
  id: '6f1c2e0a-8b3d-4c5e-9f7a-1b2c3d4e5f60',
};

describe('keyset cursors', () => {
  it('round-trips a position with millisecond precision', () => {
    expect(decodeCursor(encodeCursor(position))).toEqual(position);
  });

  it('produces cursors the contract accepts', () => {
    expect(cursorSchema.safeParse(encodeCursor(position)).success).toBe(true);
  });

  it.each([
    ['not base64 JSON', 'abc'],
    [
      'a wrong shape',
      Buffer.from(JSON.stringify({ id: 'x' })).toString('base64url'),
    ],
    [
      'a bad id',
      Buffer.from(
        JSON.stringify(['2026-11-10T00:00:00.000Z', 'nope']),
      ).toString('base64url'),
    ],
  ])('rejects %s as a validation error on cursor', (_case, cursor) => {
    expect(() => decodeCursor(cursor)).toThrow(RequestValidationException);
  });
});

describe('toPage', () => {
  const rows = [1, 2, 3].map((n) => ({
    ...position,
    id: `6f1c2e0a-8b3d-4c5e-9f7a-1b2c3d4e5f6${n}`,
    n,
  }));

  it('returns a next cursor pointing at the last item when there is one more row', () => {
    const page = toPage(rows, 2, (row) => row.n);
    expect(page.items).toEqual([1, 2]);
    expect(decodeCursor(page.nextCursor ?? '').id).toBe(rows[1].id);
  });

  it('returns no cursor on the last page', () => {
    expect(toPage(rows, 3, (row) => row.n)).toEqual({
      items: [1, 2, 3],
      nextCursor: null,
    });
  });
});
