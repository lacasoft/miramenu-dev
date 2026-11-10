import type { INestApplication } from '@nestjs/common';
import { codeRequestedSchema, errorResponseSchema } from '@miramenu/contracts';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { AppConfig } from '../src/infrastructure/config/environment';
import {
  deliveryReport,
  DinerClient,
  latestCode,
  messagesTo,
  setRecipientBehavior,
  uniquePhone,
} from './support/diner-fixtures';
import { createTestApp } from './support/test-app';

// Port 1 is never open locally or in CI, so connections are refused at once.
const UNREACHABLE_PORT = 1;
const codeOf = (body: unknown) => errorResponseSchema.parse(body).code;

const withRegistration =
  (settings: Partial<AppConfig['dinerRegistration']>) =>
  (config: AppConfig): AppConfig => ({
    ...config,
    dinerRegistration: { ...config.dinerRegistration, ...settings },
  });

describe('Diner registration and the provider of codes (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('waiting between codes (design: "puede pedir otro tras 60 s")', () => {
    it('refuses another code for 60 s, without sending it', async () => {
      const diner = new DinerClient(app);
      const phone = uniquePhone();
      await diner.requestCode(phone).expect(202);

      const again = await diner.requestCode(phone).expect(429);
      expect(codeOf(again.body)).toBe('TOO_MANY_REQUESTS');
      const retryAfter = Number(again.headers['retry-after']);
      expect(retryAfter).toBeGreaterThan(55);
      expect(retryAfter).toBeLessThanOrEqual(60);
      expect(await messagesTo(phone)).toHaveLength(1);
    });

    it('lets the diner ask again at once when the provider reports the send failed', async () => {
      const diner = new DinerClient(app);
      const phone = uniquePhone();
      await diner.requestCode(phone).expect(202);
      const [message] = await messagesTo(phone);

      await deliveryReport(app, message, 'undelivered').expect(204);

      await diner.requestCode(phone).expect(202);
      expect(await messagesTo(phone)).toHaveLength(2);
    });

    it('asks the provider by the message id before resending, and learns it failed', async () => {
      const diner = new DinerClient(app);
      const phone = uniquePhone();
      // Twilio takes the message and, when asked, says it was not delivered.
      await setRecipientBehavior(phone, 'fail');
      await diner.requestCode(phone).expect(202);

      await diner.requestCode(phone).expect(202);
      expect(await messagesTo(phone)).toHaveLength(2);
    });

    it('keeps waiting when the provider reports the code delivered, even out of order', async () => {
      const diner = new DinerClient(app);
      const phone = uniquePhone();
      await diner.requestCode(phone).expect(202);
      const [message] = await messagesTo(phone);

      await deliveryReport(app, message, 'delivered').expect(204);
      await deliveryReport(app, message, 'sent').expect(204);

      await diner.requestCode(phone).expect(429);
    });
  });

  describe('a provider that does not answer in time (design, step 2)', () => {
    let slow: INestApplication<App>;

    beforeAll(async () => {
      slow = await createTestApp({
        configure: (config) => ({
          ...config,
          verification: { ...config.verification, providerTimeoutMs: 300 },
        }),
      });
    });

    afterAll(async () => {
      await slow.close();
    });

    it('answers unconfirmed, never sends again on its own, and the code still works', async () => {
      const diner = new DinerClient(slow);
      const phone = uniquePhone();
      await setRecipientBehavior(phone, 'timeout');

      const asked = await diner.requestCode(phone).expect(202);
      expect(codeRequestedSchema.parse(asked.body).delivery).toBe(
        'unconfirmed',
      );
      await diner.requestCode(phone).expect(429);
      expect(await messagesTo(phone)).toHaveLength(1);

      // The message did leave: its code validates.
      await diner.verify(phone, await latestCode(phone)).expect(200);
    });

    it('finds the late report of an unconfirmed send by our id, and resends if it failed', async () => {
      const diner = new DinerClient(slow);
      const phone = uniquePhone();
      await setRecipientBehavior(phone, 'timeout');
      await diner.requestCode(phone).expect(202);
      const [message] = await messagesTo(phone);

      await deliveryReport(slow, message, 'failed').expect(204);

      await setRecipientBehavior(phone, 'deliver');
      const again = await diner.requestCode(phone).expect(202);
      expect(codeRequestedSchema.parse(again.body).delivery).toBe('sent');
    });
  });

  describe('a provider that refuses or fails', () => {
    it('answers PHONE_NOT_REACHABLE for a number the provider rejects, and keeps no code', async () => {
      const diner = new DinerClient(app);
      const phone = uniquePhone();
      await setRecipientBehavior(phone, 'reject');

      const response = await diner.requestCode(phone).expect(422);
      expect(codeOf(response.body)).toBe('PHONE_NOT_REACHABLE');
      // Nothing left, so no wait: the diner may correct the number or try again.
      await diner.requestCode(phone).expect(422);
      const verify = await diner.verify(phone, '123456').expect(422);
      expect(codeOf(verify.body)).toBe('CODE_EXPIRED');
    });

    it('answers CODE_PROVIDER_UNAVAILABLE when the provider fails', async () => {
      const diner = new DinerClient(app);
      const phone = uniquePhone();
      await setRecipientBehavior(phone, 'unavailable');

      const response = await diner.requestCode(phone).expect(503);
      expect(codeOf(response.body)).toBe('CODE_PROVIDER_UNAVAILABLE');
    });

    it('answers CODE_PROVIDER_UNAVAILABLE when the provider cannot be reached', async () => {
      const down = await createTestApp({
        configure: (config) => ({
          ...config,
          verification: {
            ...config.verification,
            twilio: {
              ...config.verification.twilio,
              apiBaseUrl: `http://127.0.0.1:${UNREACHABLE_PORT}`,
            },
          },
        }),
      });
      try {
        const response = await new DinerClient(down)
          .requestCode(uniquePhone())
          .expect(503);
        expect(codeOf(response.body)).toBe('CODE_PROVIDER_UNAVAILABLE');
      } finally {
        await down.close();
      }
    });
  });

  describe('limits on sending codes', () => {
    let limited: INestApplication<App>;

    beforeAll(async () => {
      limited = await createTestApp({
        configure: withRegistration({
          sendsPerPhonePerDay: 2,
          sendsPerDevicePerDay: 3,
          sendsPerIpPerHour: 4,
        }),
      });
    });

    afterAll(async () => {
      await limited.close();
    });

    // A rejected number leaves no code and so no wait: only the limits stop it.
    it('stops a phone after its sends of the day', async () => {
      const phone = uniquePhone();
      await setRecipientBehavior(phone, 'reject');
      for (let send = 1; send <= 2; send++) {
        await new DinerClient(limited).requestCode(phone).expect(422);
      }

      const response = await new DinerClient(limited)
        .requestCode(phone)
        .expect(429);
      expect(codeOf(response.body)).toBe('TOO_MANY_REQUESTS');
      expect(Number(response.headers['retry-after'])).toBeGreaterThan(
        23 * 3600,
      );
    });

    it('stops a device after its sends of the day, whatever the phone', async () => {
      const diner = new DinerClient(limited);
      for (let send = 1; send <= 3; send++) {
        await diner.requestCode(uniquePhone()).expect(202);
      }

      await diner.requestCode(uniquePhone()).expect(429);
    });

    it('stops an IP after its sends of the hour, whatever the device', async () => {
      const ip = new DinerClient(limited).ip;
      for (let send = 1; send <= 4; send++) {
        await new DinerClient(limited, undefined, ip)
          .requestCode(uniquePhone())
          .expect(202);
      }

      const response = await new DinerClient(limited, undefined, ip)
        .requestCode(uniquePhone())
        .expect(429);
      const retryAfter = Number(response.headers['retry-after']);
      expect(retryAfter).toBeGreaterThan(3500);
      expect(retryAfter).toBeLessThanOrEqual(3600);
    });
  });

  describe('delivery reports', () => {
    it('refuses a report without a signature or with a forged one', async () => {
      const diner = new DinerClient(app);
      const phone = uniquePhone();
      await diner.requestCode(phone).expect(202);
      const [message] = await messagesTo(phone);
      const callback = new URL(message.statusCallback);

      const unsigned = await request(app.getHttpServer())
        .post(`${callback.pathname}${callback.search}`)
        .type('form')
        .send({ MessageSid: message.sid, MessageStatus: 'failed' })
        .expect(403);
      expect(codeOf(unsigned.body)).toBe('FORBIDDEN');
      await deliveryReport(app, message, 'failed', 'Zm9yZ2Vk').expect(403);

      // Neither changed the send: the diner still has to wait.
      await diner.requestCode(phone).expect(429);
    });

    it('takes a genuine report about a send it does not know, and ignores it', async () => {
      const diner = new DinerClient(app);
      const phone = uniquePhone();
      await diner.requestCode(phone).expect(202);
      const [message] = await messagesTo(phone);

      await deliveryReport(
        app,
        {
          ...message,
          statusCallback: message.statusCallback.replace(
            /sendId=[^&]+/,
            'sendId=00000000-0000-4000-8000-000000000000',
          ),
        },
        'failed',
      ).expect(204);
    });
  });

  describe('Redis down (design: "no se envían códigos")', () => {
    let noRedis: INestApplication<App>;

    beforeAll(async () => {
      noRedis = await createTestApp({
        configure: (config) => ({
          ...config,
          redis: { ...config.redis, port: UNREACHABLE_PORT },
        }),
      });
    });

    afterAll(async () => {
      await noRedis.close();
    });

    it('closes registration: no code is sent and none is validated', async () => {
      const diner = new DinerClient(noRedis);
      const phone = uniquePhone();

      const asked = await diner.requestCode(phone).expect(503);
      expect(codeOf(asked.body)).toBe('REGISTRATION_UNAVAILABLE');
      const verified = await diner.verify(phone, '123456').expect(503);
      expect(codeOf(verified.body)).toBe('REGISTRATION_UNAVAILABLE');
      expect(await messagesTo(phone)).toEqual([]);
    });
  });
});
