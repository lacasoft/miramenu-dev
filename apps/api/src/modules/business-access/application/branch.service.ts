import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Branch, Page, PageQuery, QrLink } from '@miramenu/contracts';
import type { DataSource, EntityManager } from 'typeorm';
import { APP_CONFIG } from '../../../infrastructure/config/config.module';
import type { AppConfig } from '../../../infrastructure/config/environment';
import {
  decodeCursor,
  toPage,
} from '../../../infrastructure/http/keyset-cursor';
import { visibleBranchIds } from '../domain/access-policy';
import type { Actor } from '../domain/actor';
import { branchUrl, qrShortUrl } from '../domain/site-url';
import { AccessControl, notFound } from './access-control';
import {
  assignQrCode,
  clearBranchSubdomain,
  setCurrentSlug,
  setCurrentSubdomain,
} from './identifiers';
import { changeRows, selectRows } from '../../../infrastructure/database/query';

interface BranchRow {
  id: string;
  business_id: string;
  name: string;
  slug: string;
  branch_subdomain: string | null;
  business_subdomain: string;
  created_at: Date;
}

const BRANCH_SQL = `
  SELECT b.id, b.business_id, b.name, b.created_at, bs.slug,
    (SELECT s.name FROM business_access.subdomain s WHERE s.branch_id = b.id AND s.is_current) AS branch_subdomain,
    (SELECT s.name FROM business_access.subdomain s
      WHERE s.business_id = b.business_id AND s.branch_id IS NULL AND s.is_current) AS business_subdomain
  FROM business_access.branch b
  JOIN business_access.branch_slug bs ON bs.branch_id = b.id AND bs.is_current`;

export interface CreateBranchInput {
  name: string;
  slug: string;
  subdomain?: string;
}

export interface UpdateBranchInput {
  name?: string;
  slug?: string;
  /** null removes the branch's own subdomain. */
  subdomain?: string | null;
}

/** Branches are created and administered by their business admin and the superadmin (ADR-0032). */
@Injectable()
export class BranchService {
  constructor(
    @InjectDataSource('business_access')
    private readonly dataSource: DataSource,
    private readonly access: AccessControl,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Every new branch gets its QR code at once (ADR-0010). */
  async create(
    actor: Actor,
    businessId: string,
    input: CreateBranchInput,
  ): Promise<Branch> {
    this.access.assertBusiness(actor, businessId, 'administer');
    return this.dataSource.transaction(async (manager) => {
      const [business] = await selectRows(
        manager,
        `SELECT 1 FROM business_access.business WHERE id = $1`,
        [businessId],
      );
      if (!business) throw notFound();
      const [created] = await selectRows<{ id: string }>(
        manager,
        `INSERT INTO business_access.branch (business_id, name) VALUES ($1, $2) RETURNING id`,
        [businessId, input.name],
      );
      const branch = { id: created.id, businessId };
      await setCurrentSlug(manager, input.slug, branch);
      if (input.subdomain !== undefined) {
        await setCurrentSubdomain(manager, input.subdomain, {
          businessId,
          branchId: branch.id,
        });
      }
      await assignQrCode(manager, branch.id);
      return this.load(manager, branch.id);
    });
  }

  /** The business admin sees every branch; a branch admin only the ones it manages. */
  async list(
    actor: Actor,
    businessId: string,
    page: PageQuery,
  ): Promise<Page<Branch>> {
    this.access.assertBusiness(actor, businessId, 'view');
    const visible = visibleBranchIds(actor, businessId);
    const after = page.cursor ? decodeCursor(page.cursor) : null;
    const rows = await selectRows<BranchRow>(
      this.dataSource.manager,
      `${BRANCH_SQL}
       WHERE b.business_id = $1
         AND ($2::uuid[] IS NULL OR b.id = ANY($2::uuid[]))
         AND ($3::timestamptz IS NULL OR (b.created_at, b.id) < ($3::timestamptz, $4::uuid))
       ORDER BY b.created_at DESC, b.id DESC
       LIMIT $5`,
      [
        businessId,
        visible === 'all' ? null : [...visible],
        after?.createdAt ?? null,
        after?.id ?? null,
        page.limit + 1,
      ],
    );
    return toPage(
      rows.map((row) => ({ ...row, createdAt: row.created_at })),
      page.limit,
      (row) => this.toBranch(row),
    );
  }

  async get(actor: Actor, branchId: string): Promise<Branch> {
    await this.access.assertBranch(actor, branchId, 'view');
    return this.load(this.dataSource.manager, branchId);
  }

  /** Old slugs and subdomains stay as aliases of this branch (ADR-0018, ADR-0029). */
  async update(
    actor: Actor,
    branchId: string,
    input: UpdateBranchInput,
  ): Promise<Branch> {
    const branch = await this.access.assertBranch(
      actor,
      branchId,
      'administer',
    );
    return this.dataSource.transaction(async (manager) => {
      if (input.name !== undefined) {
        await changeRows(
          manager,
          `UPDATE business_access.branch SET name = $2, updated_at = now() WHERE id = $1`,
          [branch.id, input.name],
        );
      }
      if (input.slug !== undefined)
        await setCurrentSlug(manager, input.slug, branch);
      if (input.subdomain === null)
        await clearBranchSubdomain(manager, branch.id);
      if (typeof input.subdomain === 'string') {
        await setCurrentSubdomain(manager, input.subdomain, {
          businessId: branch.businessId,
          branchId: branch.id,
        });
      }
      return this.load(manager, branch.id);
    });
  }

  async qr(actor: Actor, branchId: string): Promise<QrLink> {
    await this.access.assertBranch(actor, branchId, 'view');
    const [row] = await selectRows<{ code: string }>(
      this.dataSource.manager,
      `SELECT code FROM business_access.qr_link WHERE branch_id = $1`,
      [branchId],
    );
    if (!row) throw notFound();
    return {
      code: row.code,
      shortUrl: qrShortUrl(this.config.publicSiteUrl, row.code),
    };
  }

  private async load(
    manager: EntityManager,
    branchId: string,
  ): Promise<Branch> {
    const [row] = await selectRows<BranchRow>(
      manager,
      `${BRANCH_SQL} WHERE b.id = $1`,
      [branchId],
    );
    if (!row) throw notFound();
    return this.toBranch(row);
  }

  private toBranch(row: BranchRow): Branch {
    return {
      id: row.id,
      businessId: row.business_id,
      name: row.name,
      slug: row.slug,
      subdomain: row.branch_subdomain,
      url: branchUrl(this.config.publicSiteUrl, {
        branchSubdomain: row.branch_subdomain,
        businessSubdomain: row.business_subdomain,
        slug: row.slug,
      }),
      createdAt: row.created_at.toISOString(),
    };
  }
}
