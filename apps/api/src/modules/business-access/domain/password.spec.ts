import { hashPassword, verifyAgainstDecoy, verifyPassword } from './password';

describe('password hashing (ADR-0034)', () => {
  it('verifies the right password and rejects a wrong one', async () => {
    const stored = await hashPassword('example-correct horse battery');

    await expect(
      verifyPassword('example-correct horse battery', stored),
    ).resolves.toBe(true);
    await expect(
      verifyPassword('example-correct horse batterz', stored),
    ).resolves.toBe(false);
  });

  it('stores scrypt with its parameters and a fresh salt every time', async () => {
    const first = await hashPassword('example-same password');
    const second = await hashPassword('example-same password');

    expect(first).toMatch(
      /^scrypt\$131072\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/,
    );
    expect(first).not.toBe(second);
  });

  it('treats canonically equivalent Unicode as the same password', async () => {
    const composed = 'example-contraseña-ñ'; // ñ as one code point
    const decomposed = 'example-contraseña-ñ'; // n + combining tilde
    const stored = await hashPassword(composed);

    await expect(verifyPassword(decomposed, stored)).resolves.toBe(true);
  });

  it('rejects anything that is not one of its own hashes', async () => {
    await expect(verifyPassword('anything', 'bcrypt$whatever')).resolves.toBe(
      false,
    );
    await expect(verifyPassword('anything', '')).resolves.toBe(false);
  });

  it('always fails against the decoy, which only spends the same time', async () => {
    await expect(verifyAgainstDecoy('example-any password')).resolves.toBe(
      false,
    );
  });
});
