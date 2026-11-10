import { randomUUID } from 'node:crypto';
import {
  Controller,
  Get,
  type INestApplication,
  UseGuards,
} from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import {
  DEVICE_ID_HEADER,
  dinerSessionSchema,
  errorResponseSchema,
} from '@miramenu/contracts';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { DataSource } from 'typeorm';
import {
  CurrentDiner,
  DinerDirectory,
  DinerIdentityGuard,
  DinersModule,
  type IdentifiedDiner,
} from '../src/modules/diners';
import { asOwner } from './support/admin-fixtures';
import { DinerClient, uniquePhone } from './support/diner-fixtures';
import { createTestApp } from './support/test-app';

/** Stands for a route of another context that identifies the diner (e.g. a like). */
@Controller('test/diner-identity')
class IdentityProbeController {
  @Get()
  @UseGuards(DinerIdentityGuard)
  identify(@CurrentDiner() identity: IdentifiedDiner): IdentifiedDiner {
    return identity;
  }
}

const codeOf = (body: unknown) => errorResponseSchema.parse(body).code;

describe('Diner sessions and the contracts of Diners (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    // Imports DinersModule as another context would, to use its guard.
    app = await createTestApp({
      imports: [DinersModule],
      controllers: [IdentityProbeController],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('tells a registered diner who they are, and signs them out', async () => {
    const diner = new DinerClient(app);
    const { dinerId } = await diner.register();

    const current = await diner.send('get', '/diner/session').expect(200);
    expect(current.headers['cache-control']).toBe('no-store');
    expect(dinerSessionSchema.parse(current.body)).toEqual({
      diner: { id: dinerId, name: 'Ana' },
    });

    const closed = await diner.send('delete', '/diner/session').expect(204);
    const [cleared] = closed.headers['set-cookie'] as unknown as string[];
    expect(cleared).toMatch(/^__Host-miramenu_diner=;/);
    const after = await diner.send('get', '/diner/session').expect(401);
    expect(codeOf(after.body)).toBe('UNAUTHENTICATED');
  });

  it('answers 401 without a session, and 403 to a sign-out from another site', async () => {
    await new DinerClient(app).send('get', '/diner/session').expect(401);

    const diner = new DinerClient(app);
    await diner.register();
    const foreign = await diner
      .send('delete', '/diner/session', undefined, {
        Origin: 'https://evil.example',
      })
      .expect(403);
    expect(codeOf(foreign.body)).toBe('ORIGIN_NOT_ALLOWED');
    await diner.send('get', '/diner/session').expect(200);
  });

  it('ends a session when it expires', async () => {
    const diner = new DinerClient(app);
    const { dinerId } = await diner.register();
    await asOwner((client) =>
      client.query(
        `UPDATE diners.diner_session SET expires_at = now() - interval '1 second' WHERE diner_id = $1`,
        [dinerId],
      ),
    );

    await diner.send('get', '/diner/session').expect(401);
  });

  it('identifies an anonymous diner by its device, and a registered one by its session', async () => {
    const deviceId = randomUUID();
    const anonymous = await request(app.getHttpServer())
      .get('/test/diner-identity')
      .set(DEVICE_ID_HEADER, deviceId.toUpperCase())
      .expect(200);
    expect(anonymous.body).toEqual({ deviceId, diner: null });

    const diner = new DinerClient(app);
    const { dinerId } = await diner.register();
    const registered = await diner
      .send('get', '/test/diner-identity')
      .expect(200);
    expect(registered.body).toEqual({
      deviceId: diner.deviceId,
      diner: { id: dinerId, name: 'Ana' },
    });

    // A forged cookie is no session: the diner is just anonymous.
    const forged = await request(app.getHttpServer())
      .get('/test/diner-identity')
      .set('Cookie', `__Host-miramenu_diner=${'A'.repeat(43)}`)
      .expect(200);
    expect(forged.body).toEqual({ deviceId: null, diner: null });
  });

  it('gives other contexts only the public name, never the phone or the email', async () => {
    const diner = new DinerClient(app);
    const { dinerId, phone } = await diner.register(uniquePhone(), {
      name: 'Beto',
      email: 'beto@example.test',
    });

    const names = await app
      .get(DinerDirectory)
      .publicNames([dinerId, dinerId, randomUUID()]);

    expect([...names.entries()]).toEqual([[dinerId, 'Beto']]);
    expect(JSON.stringify([...names])).not.toContain(phone);
    expect(JSON.stringify([...names])).not.toContain('beto@example.test');
  });

  describe('what Postgres guarantees', () => {
    let diners: DataSource;

    beforeAll(() => {
      diners = app.get<DataSource>(getDataSourceToken('diners'));
    });

    it('keeps one account per phone', async () => {
      const { phone } = await new DinerClient(app).register();

      await expect(
        diners.query(
          `INSERT INTO diners.diner (phone, name, validated_at) VALUES ($1, 'Copy', now())`,
          [phone],
        ),
      ).rejects.toThrow(/uq_diner_phone/);
    });

    it('never lets the API role change or delete a DinerRegistered notice', async () => {
      const { dinerId } = await new DinerClient(app).register();

      await expect(
        diners.query(
          `UPDATE diners.diner_registered SET occurred_at = now() WHERE diner_id = $1`,
          [dinerId],
        ),
      ).rejects.toThrow(/permission denied/);
      await expect(
        diners.query(
          `DELETE FROM diners.diner_registered WHERE diner_id = $1`,
          [dinerId],
        ),
      ).rejects.toThrow(/permission denied/);
    });
  });
});
