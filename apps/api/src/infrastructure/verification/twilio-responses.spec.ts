import {
  deliveryStateOf,
  outcomeOfFailedCall,
  outcomeOfResponse,
} from './twilio-responses';

const networkError = (code: string) =>
  new TypeError('fetch failed', {
    cause: Object.assign(new Error(code), { code }),
  });

describe('Twilio responses', () => {
  it('takes a 2xx as accepted, with the message SID when the body has it', () => {
    expect(outcomeOfResponse(201, { sid: 'SM123', status: 'queued' })).toEqual({
      kind: 'accepted',
      providerMessageId: 'SM123',
    });
    expect(outcomeOfResponse(201, null)).toEqual({
      kind: 'accepted',
      providerMessageId: null,
    });
  });

  it('takes a recipient error as rejected and anything else as unavailable', () => {
    for (const code of [21211, 21612, 21614, 21610, 63024]) {
      expect(outcomeOfResponse(400, { code, status: 400 })).toEqual({
        kind: 'rejected',
      });
    }
    // Bad credentials, a wrong template, Twilio's own limits or failures: not the diner's.
    for (const [status, body] of [
      [401, { code: 20003 }],
      [400, { code: 21656 }],
      [429, { code: 20429 }],
      [503, null],
    ] as const) {
      expect(outcomeOfResponse(status, body)).toEqual({ kind: 'unavailable' });
    }
  });

  it('says unknown when Twilio may have taken the message, unavailable when it cannot have', () => {
    const timeout = new DOMException('timed out', 'TimeoutError');
    expect(outcomeOfFailedCall(timeout)).toEqual({ kind: 'unknown' });
    for (const code of ['ECONNRESET', 'UND_ERR_SOCKET']) {
      expect(outcomeOfFailedCall(networkError(code))).toEqual({
        kind: 'unknown',
      });
    }
    for (const code of ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN']) {
      expect(outcomeOfFailedCall(networkError(code))).toEqual({
        kind: 'unavailable',
      });
    }
    // What fetch raises for a port it refuses to use: it never connected.
    const badPort = new TypeError('fetch failed', {
      cause: new Error('bad port'),
    });
    expect(outcomeOfFailedCall(badPort)).toEqual({ kind: 'unavailable' });
  });

  it('reduces message statuses to accepted, delivered or failed', () => {
    expect(['queued', 'sending', 'sent'].map(deliveryStateOf)).toEqual([
      'accepted',
      'accepted',
      'accepted',
    ]);
    expect(['delivered', 'read'].map(deliveryStateOf)).toEqual([
      'delivered',
      'delivered',
    ]);
    expect(['failed', 'undelivered', 'canceled'].map(deliveryStateOf)).toEqual([
      'failed',
      'failed',
      'failed',
    ]);
    expect(deliveryStateOf('received')).toBeNull();
    expect(deliveryStateOf(undefined)).toBeNull();
  });
});
