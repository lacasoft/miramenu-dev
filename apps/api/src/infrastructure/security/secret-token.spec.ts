import { secretTokenSchema } from '@miramenu/contracts';
import { generateSecretToken, hashSecretToken } from './secret-token';

describe('secret tokens', () => {
  it('generates 43-character base64url tokens that the contract accepts', () => {
    const token = generateSecretToken();
    expect(secretTokenSchema.safeParse(token).success).toBe(true);
  });

  it('never repeats a token', () => {
    const tokens = new Set(Array.from({ length: 1000 }, generateSecretToken));
    expect(tokens.size).toBe(1000);
  });

  it('stores a 32-byte SHA-256 that does not contain the token', () => {
    const token = generateSecretToken();
    const hash = hashSecretToken(token);

    expect(hash).toHaveLength(32);
    expect(hash.equals(hashSecretToken(token))).toBe(true);
    expect(hash.toString('base64url')).not.toBe(token);
  });
});
