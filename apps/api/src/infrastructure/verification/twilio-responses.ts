import type { DeliveryState, SendOutcome } from './verification-sender';

/**
 * Twilio errors that mean "this recipient cannot get the message", as opposed to a
 * problem of ours or of Twilio's: invalid To (21211), not reachable by SMS (21612),
 * not a mobile (21614), unsubscribed with STOP (21610), not a WhatsApp user (63024).
 */
const RECIPIENT_ERROR_CODES = new Set([21211, 21612, 21614, 21610, 63024]);

/**
 * Socket errors after the connection was open: the request may have reached Twilio
 * before the connection dropped, so whether the message left is unknown.
 */
const MAY_HAVE_BEEN_SENT_CODES = new Set([
  'ECONNRESET',
  'EPIPE',
  'UND_ERR_SOCKET',
  'UND_ERR_CLOSED',
]);

export const twilioErrorCode = (body: unknown): number | null =>
  typeof body === 'object' &&
  body !== null &&
  'code' in body &&
  typeof body.code === 'number'
    ? body.code
    : null;

/** The outcome of a Create Message call that got an HTTP answer. */
export function outcomeOfResponse(
  httpStatus: number,
  body: unknown,
): SendOutcome {
  if (httpStatus >= 200 && httpStatus < 300) {
    const sid =
      typeof body === 'object' &&
      body !== null &&
      'sid' in body &&
      typeof body.sid === 'string'
        ? body.sid
        : null;
    return { kind: 'accepted', providerMessageId: sid };
  }
  const code = twilioErrorCode(body);
  if (httpStatus === 400 && code !== null && RECIPIENT_ERROR_CODES.has(code)) {
    return { kind: 'rejected' };
  }
  return { kind: 'unavailable' };
}

/**
 * The outcome of a call that got no HTTP answer. A timeout, or a connection dropped
 * after it was open, may come after Twilio took the message: the outcome is unknown.
 * Anything else (refused, unknown host, a port fetch blocks) never reached Twilio.
 */
export function outcomeOfFailedCall(error: unknown): SendOutcome {
  if (error instanceof DOMException && error.name === 'TimeoutError')
    return { kind: 'unknown' };
  const cause =
    error instanceof Error && 'cause' in error ? error.cause : undefined;
  const code =
    typeof cause === 'object' &&
    cause !== null &&
    'code' in cause &&
    typeof cause.code === 'string'
      ? cause.code
      : undefined;
  return code !== undefined && MAY_HAVE_BEEN_SENT_CODES.has(code)
    ? { kind: 'unknown' }
    : { kind: 'unavailable' };
}

/** Twilio's message status reduced to registration's states; null for the irrelevant ones. */
export function deliveryStateOf(status: unknown): DeliveryState | null {
  switch (status) {
    case 'queued':
    case 'accepted':
    case 'scheduled':
    case 'sending':
    case 'sent':
      return 'accepted';
    case 'delivered':
    case 'read':
      return 'delivered';
    case 'failed':
    case 'undelivered':
    case 'canceled':
      return 'failed';
    default:
      return null;
  }
}
