// Local stand-in for Twilio's Messages API (ADR-0039), as Mailpit is for SMTP: the API
// sends verification codes here in development and CI, and nothing leaves the machine.
// Only node:http, no dependencies. It implements what the API uses:
//   POST /2010-04-01/Accounts/{sid}/Messages.json        create a message
//   GET  /2010-04-01/Accounts/{sid}/Messages/{sid}.json  fetch its status
//   GET  /2010-04-01/Accounts/{sid}.json                 the account (health check)
// and, for tests and local development:
//   GET  /_simulator/messages?to=+52…                    messages sent to a number
//   PUT  /_simulator/recipients/+52…  {"behavior": …}     how Twilio treats that number
// Behaviors: deliver (default), timeout (takes the message, answers too late), reject
// (21211, invalid number), fail (takes it, later reports it undelivered), unavailable (503).
// It never posts status callbacks: tests sign and send those themselves.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';

const PORT = 4010;
const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID ?? '';
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN ?? '';
const TIMEOUT_HOLD_MS = Number(process.env.SIMULATOR_TIMEOUT_HOLD_MS ?? 15_000);
const MAX_MESSAGES = 2000;
const BEHAVIORS = new Set(['deliver', 'timeout', 'reject', 'fail', 'unavailable']);

if (!/^AC[0-9a-fA-F]{32}$/.test(ACCOUNT_SID) || AUTH_TOKEN.length < 16) {
  console.error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required');
  process.exit(1);
}

/** @type {Array<Record<string, unknown>>} */
const messages = [];
/** @type {Map<string, string>} bare phone number -> behavior */
const behaviors = new Map();

const bare = (address) => String(address ?? '').replace(/^whatsapp:/, '');

const reply = (response, status, body) => {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(body === undefined ? '' : JSON.stringify(body));
};

const twilioError = (response, status, code, message) =>
  reply(response, status, {
    code,
    message,
    more_info: `https://www.twilio.com/docs/errors/${code}`,
    status,
  });

const readBody = (request) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > 64 * 1024) {
        reject(new Error('body too large'));
        request.destroy();
      } else {
        chunks.push(chunk);
      }
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });

const authorized = (request) => {
  const expected = Buffer.from(
    `Basic ${Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64')}`,
  );
  const received = Buffer.from(request.headers.authorization ?? '');
  return expected.length === received.length && timingSafeEqual(expected, received);
};

const messageView = (message) => ({
  sid: message.sid,
  account_sid: ACCOUNT_SID,
  to: message.to,
  from: message.from,
  messaging_service_sid: message.messagingServiceSid,
  status: message.status,
  error_code: message.errorCode,
  date_created: message.createdAt,
});

async function createMessage(request, response) {
  const form = new URLSearchParams(await readBody(request));
  const to = form.get('To');
  const from = form.get('From');
  const messagingServiceSid = form.get('MessagingServiceSid');
  const contentSid = form.get('ContentSid');
  if (!to) return twilioError(response, 400, 21604, "A 'To' phone number is required.");
  if (!from && !messagingServiceSid)
    return twilioError(response, 400, 21603, "A 'From' phone number is required.");
  if (!contentSid && !form.get('Body'))
    return twilioError(response, 400, 21619, 'A text message body or media url is required.');

  const behavior = behaviors.get(bare(to)) ?? 'deliver';
  if (behavior === 'reject')
    return twilioError(response, 400, 21211, "Invalid 'To' Phone Number");
  if (behavior === 'unavailable')
    return twilioError(response, 503, 20500, 'Internal Server Error');

  const message = {
    sid: `SM${randomBytes(16).toString('hex')}`,
    to,
    from,
    messagingServiceSid,
    contentSid,
    contentVariables: JSON.parse(form.get('ContentVariables') ?? '{}'),
    statusCallback: form.get('StatusCallback'),
    // What Twilio would report later, when the API asks.
    status: behavior === 'fail' ? 'undelivered' : 'delivered',
    errorCode: behavior === 'fail' ? 30003 : null,
    createdAt: new Date().toISOString(),
  };
  messages.push(message);
  if (messages.length > MAX_MESSAGES) messages.shift();
  const accepted = { ...messageView(message), status: 'queued', error_code: null };
  if (behavior === 'timeout') {
    setTimeout(() => reply(response, 201, accepted), TIMEOUT_HOLD_MS);
    return undefined;
  }
  return reply(response, 201, accepted);
}

async function simulatorRoute(request, response, url) {
  if (request.method === 'GET' && url.pathname === '/_simulator/health')
    return reply(response, 200, { status: 'ok' });
  if (request.method === 'GET' && url.pathname === '/_simulator/messages') {
    const to = url.searchParams.get('to');
    return reply(response, 200, {
      messages: messages.filter((message) => !to || bare(message.to) === to),
    });
  }
  const recipient = decodeURIComponent(url.pathname).match(
    /^\/_simulator\/recipients\/(\+\d{7,15})$/,
  );
  if (request.method === 'PUT' && recipient) {
    const { behavior } = JSON.parse((await readBody(request)) || '{}');
    if (!BEHAVIORS.has(behavior)) return reply(response, 400, { error: 'unknown behavior' });
    behaviors.set(recipient[1], behavior);
    return reply(response, 204);
  }
  return reply(response, 404, { error: 'not found' });
}

async function twilioRoute(request, response, url) {
  const account = `/2010-04-01/Accounts/${ACCOUNT_SID}`;
  if (!url.pathname.startsWith('/2010-04-01/Accounts/'))
    return twilioError(response, 404, 20404, 'The requested resource was not found');
  if (!authorized(request) || !url.pathname.startsWith(account))
    return twilioError(response, 401, 20003, 'Authenticate');
  if (request.method === 'GET' && url.pathname === `${account}.json`)
    return reply(response, 200, { sid: ACCOUNT_SID, status: 'active' });
  if (request.method === 'POST' && url.pathname === `${account}/Messages.json`)
    return createMessage(request, response);
  const fetchMessage = url.pathname.match(/\/Messages\/(SM[0-9a-f]{32})\.json$/);
  if (request.method === 'GET' && fetchMessage) {
    const message = messages.find((candidate) => candidate.sid === fetchMessage[1]);
    return message
      ? reply(response, 200, messageView(message))
      : twilioError(response, 404, 20404, 'The requested resource was not found');
  }
  return twilioError(response, 404, 20404, 'The requested resource was not found');
}

createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://simulator');
  const route = url.pathname.startsWith('/_simulator/') ? simulatorRoute : twilioRoute;
  route(request, response, url).catch((error) => {
    console.error(error instanceof Error ? error.message : 'request failed');
    reply(response, 400, { error: 'bad request' });
  });
}).listen(PORT, () => console.log(`Twilio simulator listening on ${PORT}`));
