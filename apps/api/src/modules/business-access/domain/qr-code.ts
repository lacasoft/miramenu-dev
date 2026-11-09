import { randomInt } from 'node:crypto';
import { QR_CODE_ALPHABET, QR_CODE_LENGTH } from '@miramenu/contracts';

/**
 * A new short code for a branch QR (ADR-0010): 7 characters of an alphabet with no
 * look-alikes, ~27 billion combinations, drawn with a cryptographic generator.
 */
export function generateQrCode(): string {
  return Array.from(
    { length: QR_CODE_LENGTH },
    () => QR_CODE_ALPHABET[randomInt(QR_CODE_ALPHABET.length)],
  ).join('');
}
