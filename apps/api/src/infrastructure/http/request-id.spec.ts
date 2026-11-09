import { resolveRequestId } from './request-id';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('resolveRequestId', () => {
  it('keeps a plain id sent by the caller', () => {
    expect(resolveRequestId('client-trace_01.abc')).toBe('client-trace_01.abc');
  });

  it('uses the first value when the header repeats', () => {
    expect(resolveRequestId(['first-request-id', 'second-request-id'])).toBe(
      'first-request-id',
    );
  });

  it.each([
    ['missing', undefined],
    ['too short', 'abc'],
    ['too long', 'a'.repeat(129)],
    ['with spaces', 'id with spaces'],
    ['with a newline (log injection)', 'valid-id\nforged log line'],
    ['with markup', '<script>alert(1)</script>'],
  ])('generates a new UUID when the incoming id is %s', (_case, incoming) => {
    expect(resolveRequestId(incoming)).toMatch(UUID);
  });
});
