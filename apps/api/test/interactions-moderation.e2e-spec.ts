import type { INestApplication } from '@nestjs/common';
import {
  errorResponseSchema,
  moderationPageSchema,
  publicCommentPageSchema,
} from '@miramenu/contracts';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  activateAdmin,
  ADMIN_PASSWORD,
  type AdminClient,
  asOwner,
  clientIp,
  createBranch,
  ensureSuperadmin,
  login,
  SUPERADMIN,
  unique,
} from './support/admin-fixtures';
import { publishBranch } from './support/catalog-fixtures';
import { DinerClient } from './support/diner-fixtures';
import {
  postComment,
  publishedRestaurant,
  type Restaurant,
} from './support/interaction-fixtures';
import { createTestApp } from './support/test-app';

const codeOf = (body: unknown) => errorResponseSchema.parse(body).code;

describe('Moderation of comments (e2e)', () => {
  let app: INestApplication<App>;
  let restaurant: Restaurant;
  let secondBranch: string;
  let superadmin: AdminClient;
  let branchAdmin: AdminClient;
  let diner: DinerClient;
  const ip = clientIp();

  const queue = async (admin: AdminClient, path: string) =>
    moderationPageSchema.parse(
      (await admin.send('get', path).expect(200)).body,
    );
  const businessQueue = (query = '') =>
    `/admin/businesses/${restaurant.business.id}/moderation${query}`;
  const branchQueue = (branchId: string, query = '') =>
    `/admin/branches/${branchId}/moderation${query}`;
  const isPublic = async (commentId: string, branchId = restaurant.branchId) =>
    publicCommentPageSchema
      .parse(
        (
          await request(app.getHttpServer())
            .get(
              `/branches/${branchId}/dishes/${restaurant.dishId}/comments?limit=50`,
            )
            .expect(200)
        ).body,
      )
      .items.some((item) => item.id === commentId);

  beforeAll(async () => {
    // One diner posts every comment here; the hourly limit is not what is under test.
    app = await createTestApp({
      configure: (config) => ({
        ...config,
        interactions: { ...config.interactions, commentsPerDinerPerHour: 100 },
      }),
    });
    await ensureSuperadmin();
    superadmin = await login(app, SUPERADMIN.email, SUPERADMIN.password, ip);
    restaurant = await publishedRestaurant(app, superadmin, ip);
    secondBranch = (
      await createBranch(restaurant.owner, restaurant.business.id)
    ).id;
    expect((await publishBranch(restaurant.owner, secondBranch)).status).toBe(
      201,
    );

    const email = `${unique('moderator')}@example.test`;
    await restaurant.owner
      .send('post', `/admin/businesses/${restaurant.business.id}/users`, {
        email,
        name: 'Branch moderator',
        role: { role: 'branch_admin', branchId: restaurant.branchId },
      })
      .expect(201);
    await activateAdmin(email);
    branchAdmin = await login(app, email, ADMIN_PASSWORD, ip);

    diner = new DinerClient(app);
    await diner.register(undefined, { name: 'Dana' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('shows the business its pending comments of every branch, oldest first', async () => {
    const first = await postComment(
      diner,
      restaurant.branchId,
      restaurant.dishId,
      'Uno',
    );
    const second = await postComment(
      diner,
      secondBranch,
      restaurant.dishId,
      'Dos',
    );

    const page = await queue(restaurant.owner, businessQueue('?limit=50'));
    const ids = page.items.map((item) => item.id);
    expect(ids).toEqual(expect.arrayContaining([first.id, second.id]));
    expect(ids.indexOf(first.id)).toBeLessThan(ids.indexOf(second.id));
    expect(page.items.find((item) => item.id === first.id)).toMatchObject({
      branchId: restaurant.branchId,
      dishId: restaurant.dishId,
      dishName: 'Pastor',
      text: 'Uno',
      author: { name: 'Dana' },
      version: 1,
      overdue: false,
    });
  });

  it("lets a branch admin moderate their branch, never the business's whole queue", async () => {
    const comment = await postComment(
      diner,
      restaurant.branchId,
      restaurant.dishId,
    );

    const own = await queue(
      branchAdmin,
      branchQueue(restaurant.branchId, '?limit=50'),
    );
    expect(own.items.map((item) => item.id)).toContain(comment.id);
    expect(
      own.items.every((item) => item.branchId === restaurant.branchId),
    ).toBe(true);
    const business = await branchAdmin.send('get', businessQueue()).expect(403);
    expect(codeOf(business.body)).toBe('FORBIDDEN');

    await branchAdmin
      .send('post', `/admin/comments/${comment.id}/approve`, { version: 1 })
      .expect(204);
    expect(await isPublic(comment.id)).toBe(true);
  });

  it('names the dish as diners read it, and none once the branch hid it', async () => {
    const branch = (
      await createBranch(restaurant.owner, restaurant.business.id)
    ).id;
    expect((await publishBranch(restaurant.owner, branch)).status).toBe(201);
    const comment = await postComment(diner, branch, restaurant.dishId);
    const named = await queue(restaurant.owner, branchQueue(branch));
    expect(named.items.find((item) => item.id === comment.id)?.dishName).toBe(
      'Pastor',
    );

    await restaurant.owner
      .send('put', `/admin/branches/${branch}/overrides/${restaurant.dishId}`, {
        priceCents: null,
        available: true,
        hidden: true,
      })
      .expect(200);
    expect((await publishBranch(restaurant.owner, branch)).status).toBe(201);
    const hidden = await queue(restaurant.owner, branchQueue(branch));
    expect(hidden.items.find((item) => item.id === comment.id)).toMatchObject({
      dishId: restaurant.dishId,
      dishName: null,
    });
  });

  it('lets the superadmin moderate too', async () => {
    const comment = await postComment(
      diner,
      restaurant.branchId,
      restaurant.dishId,
    );

    await superadmin
      .send('post', `/admin/comments/${comment.id}/reject`, { version: 1 })
      .expect(204);
    expect(await isPublic(comment.id)).toBe(false);
  });

  it('refuses to approve a version the moderator did not read', async () => {
    const comment = await postComment(
      diner,
      restaurant.branchId,
      restaurant.dishId,
    );
    await diner
      .send('patch', `/comments/${comment.id}`, {
        text: 'Texto que nadie leyó',
      })
      .expect(200);

    const stale = await restaurant.owner
      .send('post', `/admin/comments/${comment.id}/approve`, { version: 1 })
      .expect(409);
    expect(codeOf(stale.body)).toBe('COMMENT_CHANGED');
    expect(await isPublic(comment.id)).toBe(false);

    await restaurant.owner
      .send('post', `/admin/comments/${comment.id}/approve`, { version: 2 })
      .expect(204);
    // Already moderated: a second decision is a conflict too.
    const again = await restaurant.owner
      .send('post', `/admin/comments/${comment.id}/reject`, { version: 2 })
      .expect(409);
    expect(codeOf(again.body)).toBe('COMMENT_CHANGED');
    expect(await isPublic(comment.id)).toBe(true);
  });

  it('flags and counts the comments pending for more than 24 h (design: aviso)', async () => {
    const late = await postComment(
      diner,
      secondBranch,
      restaurant.dishId,
      'Tarde',
    );
    await asOwner((client) =>
      client.query(
        `UPDATE interactions.comment SET submitted_at = now() - interval '25 hours' WHERE id = $1`,
        [late.id],
      ),
    );
    await postComment(diner, secondBranch, restaurant.dishId, 'A tiempo');

    const all = await queue(
      restaurant.owner,
      branchQueue(secondBranch, '?limit=50'),
    );
    expect(all.overdueCount).toBeGreaterThanOrEqual(1);
    expect(all.items.find((item) => item.id === late.id)?.overdue).toBe(true);
    const overdue = await queue(
      restaurant.owner,
      branchQueue(secondBranch, '?overdue=true&limit=50'),
    );
    expect(overdue.items.length).toBe(overdue.overdueCount);
    expect(overdue.items.every((item) => item.overdue)).toBe(true);
  });

  it('pages through the queue with a cursor', async () => {
    const branch = (
      await createBranch(restaurant.owner, restaurant.business.id)
    ).id;
    expect((await publishBranch(restaurant.owner, branch)).status).toBe(201);
    const posted = [];
    for (const text of ['a', 'b', 'c']) {
      posted.push(
        (await postComment(diner, branch, restaurant.dishId, text)).id,
      );
    }

    const first = await queue(
      restaurant.owner,
      branchQueue(branch, '?limit=2'),
    );
    const second = await queue(
      restaurant.owner,
      branchQueue(branch, `?limit=2&cursor=${first.nextCursor}`),
    );
    expect([...first.items, ...second.items].map((item) => item.id)).toEqual(
      posted,
    );
    expect(second.nextCursor).toBeNull();
  });
});
