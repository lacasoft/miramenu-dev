import { readCookie } from './cookies';

describe('readCookie', () => {
  it('finds a cookie among others', () => {
    expect(
      readCookie(
        'theme=dark; __Host-session=abc_123-XYZ; lang=es',
        '__Host-session',
      ),
    ).toBe('abc_123-XYZ');
  });

  it('returns undefined when the header or the cookie is missing, or the value is empty', () => {
    expect(readCookie(undefined, 'session')).toBeUndefined();
    expect(readCookie('theme=dark', 'session')).toBeUndefined();
    expect(readCookie('session=', 'session')).toBeUndefined();
  });

  it('does not match a cookie whose name only contains the one asked for', () => {
    expect(
      readCookie('x__Host-session=forged', '__Host-session'),
    ).toBeUndefined();
  });

  it('keeps everything after the first equals sign', () => {
    expect(readCookie('session=a=b', 'session')).toBe('a=b');
  });
});
