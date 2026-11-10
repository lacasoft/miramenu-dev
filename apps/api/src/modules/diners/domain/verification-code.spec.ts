import { verificationCodeSchema } from '@miramenu/contracts';
import {
  codeHashOf,
  generateVerificationCode,
  MAX_LIVE_CODES,
  phoneKeyOf,
  withNewCode,
} from './verification-code';

const SECRET = 'example_diner_codes_0123456789';

describe('verification codes', () => {
  it('generates six digits, leading zeros included, that the contract accepts', () => {
    const codes = Array.from({ length: 2000 }, generateVerificationCode);

    expect(
      codes.every((code) => verificationCodeSchema.safeParse(code).success),
    ).toBe(true);
    expect(codes.some((code) => code.startsWith('0'))).toBe(true);
    expect(new Set(codes).size).toBeGreaterThan(1900);
  });

  it('keys phones and codes by an HMAC that never contains them', () => {
    const phoneKey = phoneKeyOf(SECRET, '+525512345678');
    const hash = codeHashOf(SECRET, phoneKey, '123456');

    expect(phoneKey).not.toContain('5512345678');
    expect(hash).not.toContain('123456');
    expect(phoneKeyOf(SECRET, '+525512345678')).toBe(phoneKey);
    expect(
      phoneKeyOf('example_other_secret_0123456', '+525512345678'),
    ).not.toBe(phoneKey);
  });

  it('binds a code to its phone', () => {
    const one = phoneKeyOf(SECRET, '+525512345678');
    const other = phoneKeyOf(SECRET, '+525587654321');

    expect(codeHashOf(SECRET, one, '123456')).not.toBe(
      codeHashOf(SECRET, other, '123456'),
    );
  });

  it('keeps earlier codes until they expire, and only the latest few', () => {
    const now = 1_000_000;
    const expired = { hash: 'expired', expiresAtMs: now };
    const live = Array.from({ length: MAX_LIVE_CODES }, (_, index) => ({
      hash: `live-${index}`,
      expiresAtMs: now + 1000,
    }));
    const added = { hash: 'new', expiresAtMs: now + 600_000 };

    const codes = withNewCode([expired, ...live], added, now);

    expect(codes.map((code) => code.hash)).toEqual([
      ...live.slice(1).map((code) => code.hash),
      'new',
    ]);
  });
});
