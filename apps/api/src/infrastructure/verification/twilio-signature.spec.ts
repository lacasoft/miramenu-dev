import { isTwilioSignatureValid, twilioSignature } from './twilio-signature';

// The worked example of https://www.twilio.com/docs/usage/security, character by
// character: an algorithm of our own that is wrong the same way twice would pass a test
// that only signs and checks with itself.
const DOCUMENTED = {
  authToken: '12345',
  url: 'https://example.com/myapp.php?foo=1&bar=2',
  params: {
    Digits: '1234',
    To: '+18005551212',
    From: '+14158675310',
    Caller: '+14158675310',
    CallSid: 'CA1234567890ABCDE',
  },
  signature: 'L/OH5YylLD5NRKLltdqwSvS0BnU=',
};

describe('Twilio request signature', () => {
  it("reproduces the example in Twilio's documentation", () => {
    expect(
      twilioSignature(DOCUMENTED.authToken, DOCUMENTED.url, DOCUMENTED.params),
    ).toBe(DOCUMENTED.signature);
  });

  it('accepts the documented signature and nothing that differs from it', () => {
    const { authToken, url, params, signature } = DOCUMENTED;

    expect(isTwilioSignatureValid(authToken, url, params, signature)).toBe(
      true,
    );
    expect(isTwilioSignatureValid(authToken, url, params, undefined)).toBe(
      false,
    );
    expect(isTwilioSignatureValid(authToken, url, params, 'short')).toBe(false);
    expect(isTwilioSignatureValid('54321', url, params, signature)).toBe(false);
    expect(
      isTwilioSignatureValid(authToken, `${url}&baz=3`, params, signature),
    ).toBe(false);
    expect(
      isTwilioSignatureValid(
        authToken,
        url,
        { ...params, Digits: '1235' },
        signature,
      ),
    ).toBe(false);
  });
});
