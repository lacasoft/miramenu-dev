import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  branchInteractionsSchema,
  errorResponseSchema,
  ownCommentPageSchema,
  ownCommentSchema,
  publicCommentPageSchema,
} from '@miramenu/contracts';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { AppConfig } from '../src/infrastructure/config/environment';
import {
  type AdminClient,
  clientIp,
  ensureSuperadmin,
  login,
  SUPERADMIN,
} from './support/admin-fixtures';
import { DinerClient, uniquePhone } from './support/diner-fixtures';
import {
  postComment,
  publishedRestaurant,
  type Restaurant,
} from './support/interaction-fixtures';
import { createTestApp } from './support/test-app';

const codeOf = (body: unknown) => errorResponseSchema.parse(body).code;
// Port 1 is never open locally or in CI, so connections are refused at once.
const UNREACHABLE_PORT = 1;

describe('Comments (e2e)', () => {
  let app: INestApplication<App>;
  let restaurant: Restaurant;
  let superadmin: AdminClient;
  const ip = clientIp();

  const publicComments = async (target: Restaurant = restaurant) =>
    publicCommentPageSchema.parse(
      (
        await request(app.getHttpServer())
          .get(`/branches/${target.branchId}/dishes/${target.dishId}/comments`)
          .expect(200)
      ).body,
    ).items;
  const commentCount = async () =>
    branchInteractionsSchema
      .parse(
        (
          await request(app.getHttpServer())
            .get(`/branches/${restaurant.branchId}/interactions`)
            .expect(200)
        ).body,
      )
      .dishes.find((dish) => dish.dishId === restaurant.dishId)?.comments ?? 0;
  const approve = (commentId: string, version = 1) =>
    restaurant.owner
      .send('post', `/admin/comments/${commentId}/approve`, { version })
      .expect(204);

  beforeAll(async () => {
    app = await createTestApp();
    await ensureSuperadmin();
    superadmin = await login(app, SUPERADMIN.email, SUPERADMIN.password, ip);
    restaurant = await publishedRestaurant(app, superadmin, ip);
  });

  afterAll(async () => {
    await app.close();
  });

  it('only lets a registered diner comment', async () => {
    const response = await new DinerClient(app)
      .send('post', '/comments', {
        branchId: restaurant.branchId,
        dishId: restaurant.dishId,
        text: 'Rico',
        clientId: randomUUID(),
      })
      .expect(401);
    expect(codeOf(response.body)).toBe('UNAUTHENTICATED');
  });

  it('keeps a new comment pending and out of sight until it is approved', async () => {
    const diner = new DinerClient(app);
    const { phone } = await diner.register(uniquePhone(), {
      name: 'Carla',
      email: 'carla@example.test',
    });

    const countBefore = await commentCount();
    const comment = await postComment(
      diner,
      restaurant.branchId,
      restaurant.dishId,
      '¡El mejor pastor!',
    );
    expect(ownCommentSchema.parse(comment)).toMatchObject({
      status: 'pending',
      version: 1,
      text: '¡El mejor pastor!',
    });
    expect((await publicComments()).map((item) => item.id)).not.toContain(
      comment.id,
    );

    // Pending comments never count (ADR-0008).
    expect(await commentCount()).toBe(countBefore);

    await approve(comment.id);
    expect(await commentCount()).toBe(countBefore + 1);

    const response = await request(app.getHttpServer())
      .get(
        `/branches/${restaurant.branchId}/dishes/${restaurant.dishId}/comments`,
      )
      .expect(200);
    expect(response.headers['cache-control']).toBe('public, max-age=10');
    const [shown] = publicCommentPageSchema
      .parse(response.body)
      .items.filter((item) => item.id === comment.id);
    expect(shown).toMatchObject({
      text: '¡El mejor pastor!',
      author: { name: 'Carla' },
    });
    expect(JSON.stringify(response.body)).not.toContain(phone);
    expect(JSON.stringify(response.body)).not.toContain('carla@example.test');
  });

  it('sends an edited comment back to moderation, approved or not', async () => {
    const diner = new DinerClient(app);
    await diner.register();
    const comment = await postComment(
      diner,
      restaurant.branchId,
      restaurant.dishId,
    );
    await approve(comment.id);

    const edited = await diner
      .send('patch', `/comments/${comment.id}`, { text: 'Rico, pero salado' })
      .expect(200);
    expect(ownCommentSchema.parse(edited.body)).toMatchObject({
      status: 'pending',
      version: 2,
      text: 'Rico, pero salado',
    });
    expect((await publicComments()).map((item) => item.id)).not.toContain(
      comment.id,
    );

    // The same text again has nothing new to moderate.
    const unchanged = await diner
      .send('patch', `/comments/${comment.id}`, { text: 'Rico, pero salado' })
      .expect(200);
    expect(ownCommentSchema.parse(unchanged.body).version).toBe(2);
  });

  it('lets the author delete a comment, which then disappears for everyone', async () => {
    const diner = new DinerClient(app);
    await diner.register();
    const comment = await postComment(
      diner,
      restaurant.branchId,
      restaurant.dishId,
    );
    await approve(comment.id);

    await diner.send('delete', `/comments/${comment.id}`).expect(204);
    await diner.send('delete', `/comments/${comment.id}`).expect(404);
    expect((await publicComments()).map((item) => item.id)).not.toContain(
      comment.id,
    );
    const mine = ownCommentPageSchema.parse(
      (await diner.send('get', '/comments/mine').expect(200)).body,
    );
    expect(mine.items).toEqual([]);
  });

  it("hides another diner's comment: it is not found", async () => {
    const author = new DinerClient(app);
    await author.register();
    const comment = await postComment(
      author,
      restaurant.branchId,
      restaurant.dishId,
    );
    const stranger = new DinerClient(app);
    await stranger.register();

    await stranger
      .send('patch', `/comments/${comment.id}`, { text: 'Hijacked' })
      .expect(404);
    await stranger.send('delete', `/comments/${comment.id}`).expect(404);
  });

  it('answers a retry with the same comment, and refuses the client id for another one', async () => {
    const diner = new DinerClient(app);
    await diner.register();
    const body = {
      branchId: restaurant.branchId,
      dishId: restaurant.dishId,
      text: 'Volveré',
      clientId: randomUUID(),
    };

    const first = await diner.send('post', '/comments', body).expect(201);
    const retry = await diner.send('post', '/comments', body).expect(200);
    expect(retry.body).toEqual(first.body);

    const reused = await diner
      .send('post', '/comments', { ...body, text: 'Otra cosa' })
      .expect(409);
    expect(codeOf(reused.body)).toBe('CLIENT_ID_REUSED');
  });

  it("lists a diner's own comments with their state, newest first", async () => {
    const diner = new DinerClient(app);
    await diner.register();
    const older = await postComment(
      diner,
      restaurant.branchId,
      restaurant.dishId,
      'Primero',
    );
    const newer = await postComment(
      diner,
      restaurant.branchId,
      restaurant.dishId,
      'Segundo',
    );
    await approve(older.id);

    const page = ownCommentPageSchema.parse(
      (await diner.send('get', '/comments/mine?limit=1').expect(200)).body,
    );
    expect(page.items.map((item) => item.id)).toEqual([newer.id]);
    const next = ownCommentPageSchema.parse(
      (
        await diner
          .send('get', `/comments/mine?limit=1&cursor=${page.nextCursor}`)
          .expect(200)
      ).body,
    );
    expect(next.items).toEqual([
      expect.objectContaining({ id: older.id, status: 'approved' }),
    ]);
  });

  it('refuses a text over 280 characters and a dish that is not on the menu', async () => {
    const diner = new DinerClient(app);
    await diner.register();
    const base = {
      branchId: restaurant.branchId,
      dishId: restaurant.dishId,
      clientId: randomUUID(),
    };

    const long = await diner
      .send('post', '/comments', { ...base, text: 'a'.repeat(281) })
      .expect(400);
    expect(codeOf(long.body)).toBe('VALIDATION_FAILED');
    const hidden = await diner
      .send('post', '/comments', {
        ...base,
        dishId: restaurant.hiddenDishId,
        text: 'Rico',
      })
      .expect(404);
    expect(codeOf(hidden.body)).toBe('DISH_NOT_ON_MENU');
  });

  describe('limits (ADR-0040: 5 per hour)', () => {
    const withLimit = (config: AppConfig): AppConfig => ({
      ...config,
      interactions: { ...config.interactions, commentsPerDinerPerHour: 2 },
    });

    it('stops a diner after the comments and edits of the hour', async () => {
      const limited = await createTestApp({ configure: withLimit });
      try {
        const diner = new DinerClient(limited);
        await diner.register();
        const comment = await postComment(
          diner,
          restaurant.branchId,
          restaurant.dishId,
        );
        await diner
          .send('patch', `/comments/${comment.id}`, { text: 'Editado' })
          .expect(200);

        const response = await diner
          .send('post', '/comments', {
            branchId: restaurant.branchId,
            dishId: restaurant.dishId,
            text: 'Uno más',
            clientId: randomUUID(),
          })
          .expect(429);
        expect(codeOf(response.body)).toBe('TOO_MANY_REQUESTS');
        expect(Number(response.headers['retry-after'])).toBeGreaterThan(3500);
      } finally {
        await limited.close();
      }
    });

    it('keeps comments open when Redis is down, without the limit', async () => {
      const diner = new DinerClient(app);
      await diner.register();
      const noRedis = await createTestApp({
        configure: (config) => ({
          ...withLimit(config),
          redis: { ...config.redis, port: UNREACHABLE_PORT },
        }),
      });
      try {
        // The diner's session lives in Postgres, so it still works here.
        const sameDiner = Object.assign(new DinerClient(noRedis), {
          cookie: diner.cookie,
        });
        for (let attempt = 1; attempt <= 3; attempt++) {
          await postComment(sameDiner, restaurant.branchId, restaurant.dishId);
        }
      } finally {
        await noRedis.close();
      }
    });
  });
});
