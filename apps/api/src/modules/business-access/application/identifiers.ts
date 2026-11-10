import { BUSINESS_ACCESS_ERROR_CODES } from '@miramenu/contracts';
import type { EntityManager } from 'typeorm';
import { ApiException } from '../../../infrastructure/http/api-exception';
import { generateQrCode } from '../domain/qr-code';
import { changeRows, selectRows } from '../../../infrastructure/database/query';

const subdomainTaken = () =>
  new ApiException(
    409,
    BUSINESS_ACCESS_ERROR_CODES.SUBDOMAIN_TAKEN,
    'Subdomain taken',
  );
const slugTaken = () =>
  new ApiException(409, BUSINESS_ACCESS_ERROR_CODES.SLUG_TAKEN, 'Slug taken');

interface SubdomainOwner {
  businessId: string;
  /** null for the business's own subdomain. */
  branchId: string | null;
}

/**
 * Makes `name` the current subdomain of its owner (ADR-0018). The previous one stays as an
 * alias of the same owner; a name that belongs, or once belonged, to anyone else is taken
 * for good. Rows are never deleted, and the database only lets the API move is_current.
 */
export async function setCurrentSubdomain(
  manager: EntityManager,
  name: string,
  owner: SubdomainOwner,
): Promise<void> {
  const [existing] = await selectRows<{
    business_id: string;
    branch_id: string | null;
    is_current: boolean;
  }>(
    manager,
    `SELECT business_id, branch_id, is_current FROM business_access.subdomain WHERE name = $1 FOR UPDATE`,
    [name],
  );
  if (
    existing &&
    (existing.business_id !== owner.businessId ||
      existing.branch_id !== owner.branchId)
  ) {
    throw subdomainTaken();
  }
  if (existing?.is_current) return;

  await changeRows(
    manager,
    `UPDATE business_access.subdomain SET is_current = false
     WHERE business_id = $1 AND branch_id IS NOT DISTINCT FROM $2 AND is_current`,
    [owner.businessId, owner.branchId],
  );
  if (existing) {
    await changeRows(
      manager,
      `UPDATE business_access.subdomain SET is_current = true WHERE name = $1`,
      [name],
    );
    return;
  }
  const inserted = await selectRows(
    manager,
    `INSERT INTO business_access.subdomain (name, business_id, branch_id, is_current)
     VALUES ($1, $2, $3, true) ON CONFLICT (name) DO NOTHING RETURNING name`,
    [name, owner.businessId, owner.branchId],
  );
  if (inserted.length === 0) throw subdomainTaken();
}

/** The branch goes back to its business's subdomain; its own stays reserved as an alias. */
export async function clearBranchSubdomain(
  manager: EntityManager,
  branchId: string,
): Promise<void> {
  await changeRows(
    manager,
    `UPDATE business_access.subdomain SET is_current = false WHERE branch_id = $1 AND is_current`,
    [branchId],
  );
}

/** Same rules for a branch slug inside its business (ADR-0029). */
export async function setCurrentSlug(
  manager: EntityManager,
  slug: string,
  branch: { id: string; businessId: string },
): Promise<void> {
  const [existing] = await selectRows<{
    branch_id: string;
    is_current: boolean;
  }>(
    manager,
    `SELECT branch_id, is_current FROM business_access.branch_slug WHERE business_id = $1 AND slug = $2 FOR UPDATE`,
    [branch.businessId, slug],
  );
  if (existing && existing.branch_id !== branch.id) throw slugTaken();
  if (existing?.is_current) return;

  await changeRows(
    manager,
    `UPDATE business_access.branch_slug SET is_current = false WHERE branch_id = $1 AND is_current`,
    [branch.id],
  );
  if (existing) {
    await changeRows(
      manager,
      `UPDATE business_access.branch_slug SET is_current = true WHERE business_id = $1 AND slug = $2`,
      [branch.businessId, slug],
    );
    return;
  }
  const inserted = await selectRows(
    manager,
    `INSERT INTO business_access.branch_slug (business_id, slug, branch_id, is_current)
     VALUES ($1, $2, $3, true) ON CONFLICT (business_id, slug) DO NOTHING RETURNING slug`,
    [branch.businessId, slug, branch.id],
  );
  if (inserted.length === 0) throw slugTaken();
}

const QR_CODE_ATTEMPTS = 5;

/** Gives the branch its QR code, drawing again on the (very unlikely) collision. */
export async function assignQrCode(
  manager: EntityManager,
  branchId: string,
): Promise<string> {
  for (let attempt = 0; attempt < QR_CODE_ATTEMPTS; attempt += 1) {
    const [row] = await selectRows<{ code: string }>(
      manager,
      `INSERT INTO business_access.qr_link (code, branch_id) VALUES ($1, $2)
       ON CONFLICT (code) DO NOTHING RETURNING code`,
      [generateQrCode(), branchId],
    );
    if (row) return row.code;
  }
  throw new Error('Could not draw a free QR code');
}

/** Returns the admin with this email, creating it (without password) if it is new. */
export async function findOrCreateAdminUser(
  manager: EntityManager,
  email: string,
  name: string,
): Promise<{ id: string; email: string }> {
  // Explicit columns: the API role has no privilege on is_superadmin (RNF-08).
  const [created] = await selectRows<{ id: string; email: string }>(
    manager,
    `INSERT INTO business_access.admin_user (email, name) VALUES ($1, $2)
     ON CONFLICT (email) DO NOTHING RETURNING id, email`,
    [email, name],
  );
  if (created) return created;
  const [existing] = await selectRows<{ id: string; email: string }>(
    manager,
    `SELECT id, email FROM business_access.admin_user WHERE email = $1`,
    [email],
  );
  return existing;
}
