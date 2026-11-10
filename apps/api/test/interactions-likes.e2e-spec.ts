import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import {
  branchInteractionsSchema,
  errorResponseSchema,
  likeStateSchema,
  myLikesSchema,
} from '@miramenu/contracts';
import request from 'supertest';
import type { App } from 'supertest/types';
import { ConfigModule } from '../src/infrastructure/config/config.module';
import type { AppConfig } from '../src/infrastructure/config/environment';
import { DatabaseModule } from '../src/infrastructure/database/database.module';
import { InteractionsWorkerModule } from '../src/modules/interactions';
import {
  asOwner,
  clientIp,
  ensureSuperadmin,
  login,
  SUPERADMIN,
} from './support/admin-fixtures';
import { DinerClient, PWA_ORIGIN } from './support/diner-fixtures';
import {
  LikeTransferProbeModule,
  publishedRestaurant,
  type Restaurant,
  transferLikes,
} from './support/interaction-fixtures';
import { createTestWorker, eventually } from './support/media-fixtures';
import { createTestApp } from './support/test-app';

jest.setTimeout(60_000);

const codeOf = (body: unknown) => errorResponseSchema.parse(body).code;

describe('Likes (e2e)', () => {
  let app: INestApplication<App>;
  let restaurant: Restaurant;
  let other: Restaurant;

  const like = (diner: DinerClient, dishId: string, active = true) =>
    diner.send(
      'put',
      `/branches/${restaurant.branchId}/dishes/${dishId}/like`,
      { active },
    );
  const mine = async (diner: DinerClient) =>
    myLikesSchema.parse(
      (
        await diner
          .send('get', `/branches/${restaurant.branchId}/likes/mine`)
          .expect(200)
      ).body,
    ).dishIds;
  const likesOf = async (dishId: string) => {
    const counts = branchInteractionsSchema.parse(
      (
        await request(app.getHttpServer())
          .get(`/branches/${restaurant.branchId}/interactions`)
          .expect(200)
      ).body,
    );
    return counts.dishes.find((dish) => dish.dishId === dishId)?.likes ?? 0;
  };

  beforeAll(async () => {
    app = await createTestApp({ imports: [LikeTransferProbeModule] });
    await ensureSuperadmin();
    const ip = clientIp();
    const superadmin = await login(
      app,
      SUPERADMIN.email,
      SUPERADMIN.password,
      ip,
    );
    restaurant = await publishedRestaurant(app, superadmin, ip);
    other = await publishedRestaurant(app, superadmin, ip);
  });

  afterAll(async () => {
    await app.close();
  });

  it('sets an anonymous like by device; repeating it changes nothing', async () => {
    const diner = new DinerClient(app);

    const first = await like(diner, restaurant.dishId).expect(200);
    expect(first.headers['cache-control']).toBe('no-store');
    expect(likeStateSchema.parse(first.body)).toEqual({
      active: true,
      likes: 1,
    });
    await like(diner, restaurant.dishId).expect(200, {
      active: true,
      likes: 1,
    });
    await like(new DinerClient(app), restaurant.dishId).expect(200, {
      active: true,
      likes: 2,
    });
    expect(await mine(diner)).toEqual([restaurant.dishId]);

    await like(diner, restaurant.dishId, false).expect(200, {
      active: false,
      likes: 1,
    });
    await like(diner, restaurant.dishId, false).expect(200, {
      active: false,
      likes: 1,
    });
    expect(await mine(diner)).toEqual([]);
  });

  it('publishes the counts for every diner, cached for a few seconds', async () => {
    const before = await likesOf(restaurant.dishId);
    await like(new DinerClient(app), restaurant.dishId).expect(200);

    const response = await request(app.getHttpServer())
      .get(`/branches/${restaurant.branchId}/interactions`)
      .expect(200);
    expect(response.headers['cache-control']).toBe('public, max-age=10');
    expect(await likesOf(restaurant.dishId)).toBe(before + 1);
  });

  it('refuses a dish the branch hides or that is not on its menu', async () => {
    const diner = new DinerClient(app);
    for (const dishId of [
      restaurant.hiddenDishId,
      other.dishId,
      randomUUID(),
    ]) {
      const response = await like(diner, dishId).expect(404);
      expect(codeOf(response.body)).toBe('DISH_NOT_ON_MENU');
    }
    const unpublished = await diner
      .send(
        'put',
        `/branches/${randomUUID()}/dishes/${restaurant.dishId}/like`,
        {
          active: true,
        },
      )
      .expect(404);
    expect(codeOf(unpublished.body)).toBe('DISH_NOT_ON_MENU');
  });

  it('needs a device id, and a page of the public site', async () => {
    const path = `/branches/${restaurant.branchId}/dishes/${restaurant.dishId}/like`;
    const withoutDevice = await request(app.getHttpServer())
      .put(path)
      .set('Origin', PWA_ORIGIN)
      .send({ active: true })
      .expect(400);
    expect(codeOf(withoutDevice.body)).toBe('VALIDATION_FAILED');

    const foreign = await new DinerClient(app)
      .send('put', path, { active: true }, { Origin: 'https://evil.example' })
      .expect(403);
    expect(codeOf(foreign.body)).toBe('ORIGIN_NOT_ALLOWED');
  });

  it('likes as the account once the diner is registered, from any device', async () => {
    const phoneDevice = new DinerClient(app);
    const { phone } = await phoneDevice.register();
    const laptop = new DinerClient(app);
    await laptop.register(phone);
    const before = await likesOf(restaurant.dishId);

    await like(phoneDevice, restaurant.dishId).expect(200);
    await like(laptop, restaurant.dishId).expect(200);

    expect(await likesOf(restaurant.dishId)).toBe(before + 1);
    expect(await mine(laptop)).toEqual([restaurant.dishId]);
  });

  describe('moving the likes of a device to the account (design, step 6)', () => {
    it('moves the anonymous likes, and keeps one when the account already had it', async () => {
      const elsewhere = new DinerClient(app);
      const { phone } = await elsewhere.register();
      await like(elsewhere, restaurant.dishId).expect(200);

      // Anonymous on a new phone: the same dish, and another restaurant's dish.
      const newPhone = new DinerClient(app);
      await like(newPhone, restaurant.dishId).expect(200);
      await newPhone
        .send(
          'put',
          `/branches/${other.branchId}/dishes/${other.dishId}/like`,
          {
            active: true,
          },
        )
        .expect(200);
      const before = await likesOf(restaurant.dishId);

      await newPhone.register(phone);
      await transferLikes(app);

      // The duplicate went away; the other like now belongs to the account.
      expect(await likesOf(restaurant.dishId)).toBe(before - 1);
      expect(await mine(newPhone)).toEqual([restaurant.dishId]);
      const otherMine = await newPhone
        .send('get', `/branches/${other.branchId}/likes/mine`)
        .expect(200);
      expect(myLikesSchema.parse(otherMine.body).dishIds).toEqual([
        other.dishId,
      ]);
      await expect(transferRecordOf(newPhone.deviceId)).resolves.toEqual([
        { moved_likes: 1, merged_likes: 1 },
      ]);
    });

    it('applies each notice once, however many times it runs', async () => {
      const diner = new DinerClient(app);
      await like(diner, restaurant.dishId).expect(200);
      await diner.register();

      await Promise.all([transferLikes(app), transferLikes(app)]);
      await transferLikes(app);

      await expect(transferRecordOf(diner.deviceId)).resolves.toHaveLength(1);
      expect(await mine(diner)).toEqual([restaurant.dishId]);
    });

    it('moves only the new anonymous likes when a device passes to another account', async () => {
      const shared = new DinerClient(app);
      await like(shared, restaurant.dishId).expect(200);
      const { dinerId: first } = await shared.register();
      await transferLikes(app);

      // Signed out, the device likes another restaurant anonymously; then another diner registers on it.
      const anonymousAgain = new DinerClient(app, shared.deviceId);
      await anonymousAgain
        .send(
          'put',
          `/branches/${other.branchId}/dishes/${other.dishId}/like`,
          {
            active: true,
          },
        )
        .expect(200);
      const { dinerId: second } = await anonymousAgain.register();
      await transferLikes(app);

      await expect(likeOwners(shared.deviceId)).resolves.toEqual(
        expect.arrayContaining([
          { branch_id: restaurant.branchId, diner_id: first },
          { branch_id: other.branchId, diner_id: second },
        ]),
      );
    });
  });

  describe('the worker', () => {
    let worker: TestingModule;

    beforeAll(async () => {
      worker = await createTestWorker(
        (config: AppConfig) => ({
          ...config,
          interactions: {
            ...config.interactions,
            likeTransferIntervalSeconds: 1,
          },
        }),
        [ConfigModule, DatabaseModule, InteractionsWorkerModule],
      );
    });

    afterAll(async () => {
      await worker.close();
    });

    it('moves the likes on its own, within its interval', async () => {
      const diner = new DinerClient(app);
      await like(diner, restaurant.dishId).expect(200);
      const { dinerId } = await diner.register();

      await eventually(async () => {
        const owners = await likeOwners(diner.deviceId);
        return owners[0]?.diner_id === dinerId ? true : undefined;
      }, 20_000);
    });
  });

  describe('what Postgres guarantees', () => {
    it('keeps one like per device, and one per account, for each dish', async () => {
      const deviceId = randomUUID();
      const dinerId = randomUUID();
      const insert = (columns: string, values: string[]) =>
        asOwner((client) =>
          client.query(
            `INSERT INTO interactions.dish_like (branch_id, dish_id, ${columns}) VALUES ($1, $2, $3${values.length > 1 ? ', $4' : ''})`,
            [restaurant.branchId, restaurant.dishId, ...values],
          ),
        );

      await insert('device_id', [deviceId]);
      await expect(insert('device_id', [deviceId])).rejects.toThrow(
        /uq_dish_like_device/,
      );
      await insert('diner_id, device_id', [dinerId, randomUUID()]);
      await expect(
        insert('diner_id, device_id', [dinerId, randomUUID()]),
      ).rejects.toThrow(/uq_dish_like_diner/);
    });
  });
});

const transferRecordOf = (deviceId: string) =>
  asOwner(async (client) => {
    const result = await client.query<{
      moved_likes: number;
      merged_likes: number;
    }>(
      `SELECT moved_likes, merged_likes FROM interactions.transferred_device WHERE device_id = $1`,
      [deviceId],
    );
    return result.rows;
  });

const likeOwners = (deviceId: string) =>
  asOwner(async (client) => {
    const result = await client.query<{
      branch_id: string;
      diner_id: string | null;
    }>(
      `SELECT branch_id, diner_id FROM interactions.dish_like WHERE device_id = $1 ORDER BY created_at`,
      [deviceId],
    );
    return result.rows;
  });
