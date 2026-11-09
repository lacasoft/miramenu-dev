import { assertSafeObjectKey } from './object-storage';

describe('assertSafeObjectKey', () => {
  it.each(['media/dish-1/cover.webp', 'originals/2026/11/a_b-c.mp4', 'plain'])(
    'accepts the relative key %s',
    (key) => {
      expect(() => assertSafeObjectKey(key)).not.toThrow();
    },
  );

  it.each([
    ['empty', ''],
    ['absolute', '/media/cover.webp'],
    ['parent traversal', 'media/../secrets.txt'],
    ['current directory', 'media/./cover.webp'],
    ['empty segment', 'media//cover.webp'],
    ['trailing slash', 'media/'],
    ['backslash', 'media\\cover.webp'],
    ['hidden dotfile', 'media/.env'],
    ['query characters', 'media/cover.webp?x=1'],
    ['too long', 'a'.repeat(1025)],
  ])('rejects a key that is %s', (_case, key) => {
    expect(() => assertSafeObjectKey(key)).toThrow('Unsafe object key');
  });
});
