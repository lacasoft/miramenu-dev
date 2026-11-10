import { randomUUID } from 'node:crypto';
import {
  type BranchMenuDraft,
  type BusinessMenuDraft,
  IDEMPOTENCY_KEY_HEADER,
  type Profile,
} from '@miramenu/contracts';
import type { AdminClient } from './admin-fixtures';

export const PROFILE: Profile = {
  name: 'La Fonda',
  socialLinks: [{ network: 'instagram', url: 'https://instagram.com/lafonda' }],
};

/** A fresh Idempotency-Key header, as the admin app sends with each publish click. */
export const idempotencyHeader = (key: string = randomUUID()) => ({
  [IDEMPOTENCY_KEY_HEADER]: key,
});

export async function createCategory(
  admin: AdminClient,
  businessId: string,
  name = 'Tacos',
): Promise<string> {
  const response = await admin
    .send('post', `/admin/businesses/${businessId}/categories`, { name })
    .expect(201);
  return (response.body as { id: string }).id;
}

export async function createDish(
  admin: AdminClient,
  businessId: string,
  categoryId: string,
  fields: { name?: string; priceCents?: number; position?: number } = {},
): Promise<string> {
  const response = await admin
    .send('post', `/admin/businesses/${businessId}/dishes`, {
      categoryId,
      name: fields.name ?? 'Pastor',
      priceCents: fields.priceCents ?? 2500,
      currency: 'MXN',
      ...(fields.position === undefined ? {} : { position: fields.position }),
    })
    .expect(201);
  return (response.body as { id: string }).id;
}

export async function businessDraft(
  admin: AdminClient,
  businessId: string,
): Promise<BusinessMenuDraft> {
  const response = await admin
    .send('get', `/admin/businesses/${businessId}/menu-draft`)
    .expect(200);
  return response.body as BusinessMenuDraft;
}

export async function branchDraft(
  admin: AdminClient,
  branchId: string,
): Promise<BranchMenuDraft> {
  const response = await admin
    .send('get', `/admin/branches/${branchId}/menu-draft`)
    .expect(200);
  return response.body as BranchMenuDraft;
}

/** Publishes the base draft as the admin just reviewed it, confirming the conflicts it shows. */
export async function publishBusiness(
  admin: AdminClient,
  businessId: string,
  key?: string,
) {
  const draft = await businessDraft(admin, businessId);
  return admin.send(
    'post',
    `/admin/businesses/${businessId}/publications`,
    {
      draftVersion: draft.draftVersion,
      confirmedConflicts: draft.conflicts.map(({ branchId, dishId }) => ({
        branchId,
        dishId,
      })),
    },
    idempotencyHeader(key),
  );
}

export async function publishBranch(
  admin: AdminClient,
  branchId: string,
  key?: string,
) {
  const draft = await branchDraft(admin, branchId);
  return admin.send(
    'post',
    `/admin/branches/${branchId}/publications`,
    { draftVersion: draft.draftVersion },
    idempotencyHeader(key),
  );
}
