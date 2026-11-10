import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { DEVICE_ID_HEADER, type DinerSession } from '@miramenu/contracts';
import request from 'supertest';
import type { App } from 'supertest/types';
import { parseEnvironment } from '../../src/infrastructure/config/environment';
import { twilioSignature } from '../../src/infrastructure/verification/twilio-signature';

const config = parseEnvironment(process.env);
const site = new URL(config.publicSiteUrl);

/** A restaurant's subdomain of the public site: the Origin the PWA sends. */
export const PWA_ORIGIN = `${site.protocol}//tacos.${site.host}`;
export const PRIVACY_NOTICE_VERSION =
  config.dinerRegistration.privacyNoticeVersion;

// Test-only, as Mailpit's URL: the API itself only knows TWILIO_API_BASE_URL.
const simulator = `http://127.0.0.1:${process.env.TWILIO_SIMULATOR_PORT ?? ''}`;

/**
 * A client IP of its own, from the IPv6 documentation range (2001:db8::/32). Send limits
 * by IP last an hour in Redis, so the 254 addresses of TEST-NET-3 would repeat across
 * runs and trip the limits of another test.
 */
export const uniqueIp = (): string =>
  `2001:db8:${(randomBytes(12).toString('hex').match(/.{4}/g) ?? []).join(':')}`;

/** A Mexican mobile of its own for each test, so tests never share codes or limits. */
export const uniquePhone = (): string =>
  `+5255${String(randomInt(0, 10 ** 8)).padStart(8, '0')}`;

export interface SimulatedMessage {
  sid: string;
  to: string;
  from: string | null;
  messagingServiceSid: string | null;
  contentSid: string;
  contentVariables: Record<string, string>;
  statusCallback: string;
}

export type RecipientBehavior =
  'deliver' | 'timeout' | 'reject' | 'fail' | 'unavailable';

/** How the simulated Twilio treats a number (see config/twilio-simulator/server.mjs). */
export async function setRecipientBehavior(
  phone: string,
  behavior: RecipientBehavior,
): Promise<void> {
  const response = await fetch(`${simulator}/_simulator/recipients/${phone}`, {
    method: 'PUT',
    body: JSON.stringify({ behavior }),
  });
  if (response.status !== 204)
    throw new Error(`simulator answered ${response.status}`);
}

/** Every message the simulated Twilio took for a number, oldest first. */
export async function messagesTo(phone: string): Promise<SimulatedMessage[]> {
  const response = await fetch(
    `${simulator}/_simulator/messages?to=${encodeURIComponent(phone)}`,
  );
  return ((await response.json()) as { messages: SimulatedMessage[] }).messages;
}

/** The code of the latest message to a number, as the diner would read it. */
export async function latestCode(phone: string): Promise<string> {
  const messages = await messagesTo(phone);
  const last = messages.at(-1);
  if (!last) throw new Error('no message reached this number');
  return last.contentVariables['1'];
}

/** Our id of a send, as the message's status callback URL carries it. */
export const sendIdOf = (message: SimulatedMessage): string =>
  new URL(message.statusCallback).searchParams.get('sendId') ?? '';

/**
 * A delivery report exactly as Twilio would post it to the callback URL of a message,
 * signed with the Auth Token (the algorithm is checked against Twilio's own example).
 */
export function deliveryReport(
  app: INestApplication<App>,
  message: SimulatedMessage,
  status: string,
  signature?: string,
) {
  const params: Record<string, string> = {
    AccountSid: config.verification.twilio.accountSid,
    MessageSid: message.sid,
    MessageStatus: status,
    To: message.to,
    ...(status === 'failed' || status === 'undelivered'
      ? { ErrorCode: '30003' }
      : {}),
  };
  const callback = new URL(message.statusCallback);
  const signed =
    signature ??
    twilioSignature(
      config.verification.twilio.authToken,
      message.statusCallback,
      params,
    );
  return request(app.getHttpServer())
    .post(`${callback.pathname}${callback.search}`)
    .type('form')
    .set('X-Twilio-Signature', signed)
    .send(params);
}

/** A diner's browser: its device id, its IP, the PWA's Origin and, once signed in, the cookie. */
export class DinerClient {
  cookie: string | undefined;

  constructor(
    private readonly app: INestApplication<App>,
    readonly deviceId: string = randomUUID(),
    readonly ip: string = uniqueIp(),
  ) {}

  send(
    method: 'get' | 'post' | 'put' | 'patch' | 'delete',
    path: string,
    body?: object,
    headers: Readonly<Record<string, string>> = {},
  ) {
    let call = request(this.app.getHttpServer())
      [method](path)
      .set('Origin', PWA_ORIGIN)
      .set(DEVICE_ID_HEADER, this.deviceId)
      .set('X-Forwarded-For', this.ip);
    if (this.cookie !== undefined) call = call.set('Cookie', this.cookie);
    call = call.set(headers);
    return body === undefined ? call : call.send(body);
  }

  requestCode(phone: string) {
    return this.send('post', '/registration/code', { phone });
  }

  verify(phone: string, code: string, extra: object = {}) {
    return this.send('post', '/registration/verify', {
      phone,
      code,
      name: 'Ana',
      privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
      ...extra,
    });
  }

  /** Asks for a code, reads it from the simulator and validates it: a registered diner. */
  async register(
    phone: string = uniquePhone(),
    extra: object = {},
  ): Promise<{ phone: string; dinerId: string }> {
    await this.requestCode(phone).expect(202);
    const response = await this.verify(
      phone,
      await latestCode(phone),
      extra,
    ).expect(200);
    const setCookie = response.headers['set-cookie'] as unknown as string[];
    this.cookie = setCookie[0].split(';')[0];
    return { phone, dinerId: (response.body as DinerSession).diner.id };
  }
}
