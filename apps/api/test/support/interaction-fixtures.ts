import { randomUUID } from 'node:crypto';
import { type INestApplication, Module } from '@nestjs/common';
import type { OwnComment } from '@miramenu/contracts';
import type { App } from 'supertest/types';
import { DinersModule } from '../../src/modules/diners';
import { LikeTransfer } from '../../src/modules/interactions/application/like-transfer';
import {
  ADMIN_PASSWORD,
  type AdminClient,
  type BusinessFixture,
  createBranch,
  createBusiness,
  login,
} from './admin-fixtures';
import {
  createCategory,
  createDish,
  PROFILE,
  publishBranch,
  publishBusiness,
} from './catalog-fixtures';
import type { DinerClient } from './diner-fixtures';

export interface Restaurant {
  business: BusinessFixture;
  owner: AdminClient;
  branchId: string;
  /** On the branch's published menu. */
  dishId: string;
  /** Hidden by the branch, so absent from its published menu. */
  hiddenDishId: string;
}

/** A business with one branch whose menu is published: one dish shown and one hidden. */
export async function publishedRestaurant(
  app: INestApplication<App>,
  superadmin: AdminClient,
  ip: string,
): Promise<Restaurant> {
  const business = await createBusiness(superadmin);
  const owner = await login(app, business.adminEmail, ADMIN_PASSWORD, ip);
  const branchId = (await createBranch(owner, business.id)).id;
  await owner
    .send('put', `/admin/businesses/${business.id}/profile`, PROFILE)
    .expect(200);
  const category = await createCategory(owner, business.id);
  const dishId = await createDish(owner, business.id, category, {
    name: 'Pastor',
  });
  const hiddenDishId = await createDish(owner, business.id, category, {
    name: 'Suadero',
  });
  expect((await publishBusiness(owner, business.id)).status).toBe(201);
  await owner
    .send('put', `/admin/branches/${branchId}/overrides/${hiddenDishId}`, {
      priceCents: null,
      available: true,
      hidden: true,
    })
    .expect(200);
  expect((await publishBranch(owner, branchId)).status).toBe(201);
  return { business, owner, branchId, dishId, hiddenDishId };
}

export async function postComment(
  diner: DinerClient,
  branchId: string,
  dishId: string,
  text = 'Muy rico',
): Promise<OwnComment> {
  const response = await diner
    .send('post', '/comments', {
      branchId,
      dishId,
      text,
      clientId: randomUUID(),
    })
    .expect(201);
  return response.body as OwnComment;
}

/**
 * The worker's like transfer without its timer, so a test applies the pending notices
 * exactly when it wants: import it into the test app and call transferLikes.
 */
@Module({ imports: [DinersModule], providers: [LikeTransfer] })
export class LikeTransferProbeModule {}

/** What the worker does every few seconds: apply the pending DinerRegistered notices. */
export const transferLikes = (app: INestApplication<App>) =>
  app.get(LikeTransfer, { strict: false }).processPending();
