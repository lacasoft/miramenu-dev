import { createHash, randomBytes } from 'node:crypto';

/** 32 random bytes in base64url: the value only the holder of a session or invitation sees. */
export function generateSecretToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * What the database stores instead of the token (ADR-0028). The token has 256 bits of
 * entropy, so a fast hash is enough: there is nothing to brute-force.
 */
export function hashSecretToken(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}
