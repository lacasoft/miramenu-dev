import { setTimeout as sleep } from 'node:timers/promises';
import type { INestApplication } from '@nestjs/common';
import {
  codeRequestedSchema,
  DEVICE_ID_HEADER,
  dinerSessionSchema,
  errorResponseSchema,
} from '@miramenu/contracts';
import request from 'supertest';
import type { App } from 'supertest/types';
import { parseEnvironment } from '../src/infrastructure/config/environment';
import { DinerRegistrations } from '../src/modules/diners';
import { asOwner } from './support/admin-fixtures';
import {
  DinerClient,
  latestCode,
  messagesTo,
  PRIVACY_NOTICE_VERSION,
  sendIdOf,
  uniquePhone,
} from './support/diner-fixtures';
import { createTestApp } from './support/test-app';

const twilio = parseEnvironment(process.env).verification.twilio;
const codeOf = (body: unknown) => errorResponseSchema.parse(body).code;
const wrong = (code: string) =>
  String((Number(code) + 1) % 1_000_000).padStart(6, '0');

const dinerRows = (phone: string) =>
  asOwner(async (client) => {
    const diner = await client.query<{
      id: string;
      name: string;
      email: string | null;
    }>(`SELECT id, name, email FROM diners.diner WHERE phone = $1`, [phone]);
    const id = diner.rows[0]?.id;
    const devices = await client.query<{ id: string }>(
      `SELECT id FROM diners.device WHERE diner_id = $1 ORDER BY linked_at`,
      [id],
    );
    const consents = await client.query<{
      kind: string;
      notice_version: string;
    }>(
      `SELECT kind, notice_version FROM diners.consent WHERE diner_id = $1 ORDER BY kind`,
      [id],
    );
    const notices = await client.query<{ device_id: string }>(
      `SELECT device_id FROM diners.diner_registered WHERE diner_id = $1 ORDER BY position`,
      [id],
    );
    return {
      diner: diner.rows[0],
      devices: devices.rows.map((row) => row.id),
      consents: consents.rows,
      notices: notices.rows.map((row) => row.device_id),
    };
  });

/** The latest notice so far, to read only what a test adds after it. */
const lastPosition = () =>
  asOwner(async (client) => {
    const result = await client.query<{ position: string }>(
      `SELECT coalesce(max(position), 0) AS position FROM diners.diner_registered`,
    );
    return Number(result.rows[0].position);
  });

describe('Diner registration with a code (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('sends the code by WhatsApp through the Content template and registers the diner', async () => {
    const diner = new DinerClient(app);
    const phone = uniquePhone();

    const asked = await diner.requestCode(phone).expect(202);
    expect(codeRequestedSchema.parse(asked.body)).toMatchObject({
      delivery: 'sent',
      resendAfterSeconds: 60,
    });
    const [message] = await messagesTo(phone);
    expect(message).toMatchObject({
      to: `whatsapp:${phone}`,
      from: `whatsapp:${twilio.from}`,
      contentSid: twilio.contentSid,
    });
    expect(message.contentVariables['1']).toMatch(/^\d{6}$/);
    expect(message.statusCallback).toBe(
      `${twilio.statusCallbackUrl}?sendId=${sendIdOf(message)}`,
    );

    const verified = await diner
      .verify(phone, message.contentVariables['1'], { name: '  Ana López ' })
      .expect(200);
    expect(verified.headers['cache-control']).toBe('no-store');
    const session = dinerSessionSchema.parse(verified.body);
    expect(session.diner.name).toBe('Ana López');
    const [cookie] = verified.headers['set-cookie'] as unknown as string[];
    expect(cookie).toMatch(/^__Host-miramenu_diner=[A-Za-z0-9_-]{43};/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Strict');

    await expect(dinerRows(phone)).resolves.toEqual({
      diner: { id: session.diner.id, name: 'Ana López', email: null },
      devices: [diner.deviceId],
      consents: [
        { kind: 'privacy_notice', notice_version: PRIVACY_NOTICE_VERSION },
      ],
      notices: [diner.deviceId],
    });
  });

  it('sends the code by SMS when that is the configured channel', async () => {
    const smsApp = await createTestApp({
      configure: (config) => ({
        ...config,
        verification: { ...config.verification, channel: 'sms' },
      }),
    });
    try {
      const diner = new DinerClient(smsApp);
      const phone = uniquePhone();

      await diner.register(phone);

      const [message] = await messagesTo(phone);
      expect(message.to).toBe(phone);
      expect(message.from).toBe(twilio.from);
    } finally {
      await smsApp.close();
    }
  });

  it('keeps the code after a wrong attempt, and uses it only once', async () => {
    const diner = new DinerClient(app);
    const phone = uniquePhone();
    await diner.requestCode(phone).expect(202);
    const code = await latestCode(phone);

    const wrongAttempt = await diner.verify(phone, wrong(code)).expect(422);
    expect(codeOf(wrongAttempt.body)).toBe('CODE_INVALID');
    await diner.verify(phone, code).expect(200);

    const replay = await diner.verify(phone, code).expect(422);
    expect(codeOf(replay.body)).toBe('CODE_EXPIRED');
  });

  it('voids the code on its fifth wrong attempt', async () => {
    const diner = new DinerClient(app);
    const phone = uniquePhone();
    await diner.requestCode(phone).expect(202);
    const code = await latestCode(phone);

    for (let attempt = 1; attempt <= 4; attempt++) {
      const response = await diner.verify(phone, wrong(code)).expect(422);
      expect(codeOf(response.body)).toBe('CODE_INVALID');
    }
    const last = await diner.verify(phone, wrong(code)).expect(422);
    expect(codeOf(last.body)).toBe('CODE_EXPIRED');

    const tooLate = await diner.verify(phone, code).expect(422);
    expect(codeOf(tooLate.body)).toBe('CODE_EXPIRED');
  });

  it('answers CODE_EXPIRED for a phone that never asked for a code', async () => {
    const response = await new DinerClient(app)
      .verify(uniquePhone(), '123456')
      .expect(422);
    expect(codeOf(response.body)).toBe('CODE_EXPIRED');
  });

  it('asks to show the current privacy notice before spending an attempt', async () => {
    const diner = new DinerClient(app);
    const phone = uniquePhone();
    await diner.requestCode(phone).expect(202);
    const code = await latestCode(phone);

    const outdated = await diner
      .verify(phone, code, { privacyNoticeVersion: 'older-notice' })
      .expect(409);
    expect(codeOf(outdated.body)).toBe('PRIVACY_NOTICE_OUTDATED');
    await diner.verify(phone, code).expect(200);
  });

  it('records the offers consent once given, and keeps the email when it is not sent again', async () => {
    const diner = new DinerClient(app);
    const { phone } = await diner.register(uniquePhone(), {
      offersConsent: true,
      email: 'Ana@Example.TEST',
    });
    await new DinerClient(app).register(phone, { name: 'Ana María' });

    const rows = await dinerRows(phone);
    expect(rows.diner).toMatchObject({
      name: 'Ana María',
      email: 'ana@example.test',
    });
    expect(rows.consents.map((consent) => consent.kind)).toEqual([
      'offers',
      'privacy_notice',
    ]);
  });

  it('is one account per phone, with a notice for each device that passes to it', async () => {
    const registrations = app.get(DinerRegistrations);
    const start = await lastPosition();
    const first = new DinerClient(app);
    const { phone, dinerId } = await first.register();
    const [notice] = (await registrations.after(start, 500)).filter(
      (candidate) => candidate.dinerId === dinerId,
    );

    // The same device again: same account, no new notice.
    const again = new DinerClient(app, first.deviceId);
    await again.register(phone);
    // Another device of the same diner: its likes must pass too.
    const second = new DinerClient(app);
    const repeated = await second.register(phone);

    expect(repeated.dinerId).toBe(dinerId);
    const rows = await dinerRows(phone);
    expect(rows.notices).toEqual([first.deviceId, second.deviceId]);
    const after = await registrations.after(notice.position, 500);
    expect(after.filter((candidate) => candidate.dinerId === dinerId)).toEqual([
      expect.objectContaining({ deviceId: second.deviceId }),
    ]);
  });

  it('moves a device to the account of whoever registers on it last', async () => {
    const shared = new DinerClient(app);
    const { phone: firstPhone } = await shared.register();
    const { phone: secondPhone, dinerId } = await new DinerClient(
      app,
      shared.deviceId,
    ).register();

    expect((await dinerRows(firstPhone)).devices).toEqual([]);
    const second = await dinerRows(secondPhone);
    expect(second.diner.id).toBe(dinerId);
    expect(second.devices).toEqual([shared.deviceId]);
    expect(second.notices).toEqual([shared.deviceId]);
  });

  it('gives positions in order, so a reader that keeps the last one never skips a notice', async () => {
    const registrations = app.get(DinerRegistrations);
    const start = await lastPosition();

    const devices = await Promise.all(
      Array.from({ length: 4 }, async () => {
        const diner = new DinerClient(app);
        await diner.register();
        return diner.deviceId;
      }),
    );

    const read = await registrations.after(start, 500);
    const positions = read.map((notice) => notice.position);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(read.map((notice) => notice.deviceId)).toEqual(
      expect.arrayContaining(devices),
    );
  });

  it('accepts a code sent earlier while it is still valid, so a late message still works', async () => {
    const quick = await createTestApp({
      configure: (config) => ({
        ...config,
        dinerRegistration: { ...config.dinerRegistration, resendSeconds: 1 },
      }),
    });
    try {
      const diner = new DinerClient(quick);
      const phone = uniquePhone();
      await diner.requestCode(phone).expect(202);
      const first = await latestCode(phone);
      await sleep(1100);
      await diner.requestCode(phone).expect(202);
      expect(await latestCode(phone)).not.toBe(first);

      await diner.verify(phone, first).expect(200);
    } finally {
      await quick.close();
    }
  });

  it('lets a code expire', async () => {
    const short = await createTestApp({
      configure: (config) => ({
        ...config,
        dinerRegistration: { ...config.dinerRegistration, codeTtlSeconds: 1 },
      }),
    });
    try {
      const diner = new DinerClient(short);
      const phone = uniquePhone();
      await diner.requestCode(phone).expect(202);
      const code = await latestCode(phone);
      await sleep(1200);

      const response = await diner.verify(phone, code).expect(422);
      expect(codeOf(response.body)).toBe('CODE_EXPIRED');
    } finally {
      await short.close();
    }
  });

  it('only takes requests from pages of the public site, with a device id', async () => {
    const phone = uniquePhone();
    for (const origin of [undefined, 'https://evil.example']) {
      let call = request(app.getHttpServer())
        .post('/registration/code')
        .set(DEVICE_ID_HEADER, new DinerClient(app).deviceId);
      if (origin) call = call.set('Origin', origin);
      const response = await call.send({ phone }).expect(403);
      expect(codeOf(response.body)).toBe('ORIGIN_NOT_ALLOWED');
    }

    const withoutDevice = await new DinerClient(app)
      .requestCode(phone)
      .set(DEVICE_ID_HEADER, 'not-a-uuid')
      .expect(400);
    expect(codeOf(withoutDevice.body)).toBe('VALIDATION_FAILED');
    const foreign = await new DinerClient(app)
      .requestCode('+15551234567')
      .expect(400);
    expect(codeOf(foreign.body)).toBe('VALIDATION_FAILED');
    expect(await messagesTo(phone)).toEqual([]);
  });
});
