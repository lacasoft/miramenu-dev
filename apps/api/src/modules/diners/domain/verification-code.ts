import { createHmac, randomInt } from 'node:crypto';
import { VERIFICATION_CODE_LENGTH } from '@miramenu/contracts';

/**
 * Codes still valid for a phone. A new code does not void the ones before it until they
 * expire, so a message that arrives late still carries a code that works.
 */
export const MAX_LIVE_CODES = 3;

export interface LiveCode {
  /** HMAC of the code: Redis never holds a code or a phone number in the clear. */
  hash: string;
  expiresAtMs: number;
}

export function generateVerificationCode(): string {
  return randomInt(0, 10 ** VERIFICATION_CODE_LENGTH)
    .toString()
    .padStart(VERIFICATION_CODE_LENGTH, '0');
}

const hmac = (secret: string, value: string): string =>
  createHmac('sha256', secret).update(value, 'utf8').digest('base64url');

/** Stands for the phone in every Redis key, so no key reveals a number. */
export function phoneKeyOf(secret: string, phone: string): string {
  return hmac(secret, `phone:${phone}`);
}

/**
 * Bound to its phone: the same code for another number is a different hash. Keyed by a
 * secret, so a copy of Redis does not let anyone try the 10^6 codes offline.
 */
export function codeHashOf(
  secret: string,
  phoneKey: string,
  code: string,
): string {
  return hmac(secret, `code:${phoneKey}:${code}`);
}

/** The live codes after adding a new one: expired ones go, and at most MAX_LIVE_CODES stay. */
export function withNewCode(
  codes: readonly LiveCode[],
  code: LiveCode,
  nowMs: number,
): LiveCode[] {
  return [...codes.filter((live) => live.expiresAtMs > nowMs), code].slice(
    -MAX_LIVE_CODES,
  );
}
