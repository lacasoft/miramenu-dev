import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * X-Twilio-Signature of a form POST, as Twilio documents it: the full URL, then each POST
 * parameter name and value with no delimiters, sorted by name case-sensitively, signed
 * with HMAC-SHA1 keyed by the Auth Token and encoded in base64.
 */
export function twilioSignature(
  authToken: string,
  url: string,
  params: Readonly<Record<string, string>>,
): string {
  const payload = Object.keys(params)
    .sort()
    .reduce((signed, name) => signed + name + params[name], url);
  return createHmac('sha1', authToken).update(payload, 'utf8').digest('base64');
}

/** Compares in constant time; a missing or malformed signature is simply not valid. */
export function isTwilioSignatureValid(
  authToken: string,
  url: string,
  params: Readonly<Record<string, string>>,
  signature: string | undefined,
): boolean {
  if (signature === undefined) return false;
  const expected = Buffer.from(twilioSignature(authToken, url, params));
  const received = Buffer.from(signature);
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}
