import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type {
  Business,
  CreatedBusiness,
  Page,
  PageQuery,
} from '@miramenu/contracts';
import type { DataSource, EntityManager } from 'typeorm';
import {
  decodeCursor,
  toPage,
} from '../../../infrastructure/http/keyset-cursor';
import type { Actor } from '../domain/actor';
import { AccessControl, notFound } from './access-control';
import { findOrCreateAdminUser, setCurrentSubdomain } from './identifiers';
import { InvitationService } from './invitation.service';
import { changeRows, selectRows } from './sql';

interface BusinessRow {
  id: string;
  name: string;
  country: string;
  subdomain: string;
  created_at: Date;
}

const BUSINESS_SQL = `
  SELECT b.id, b.name, b.country, b.created_at, s.name AS subdomain
  FROM business_access.business b
  JOIN business_access.subdomain s ON s.business_id = b.id AND s.branch_id IS NULL AND s.is_current`;

const toBusiness = (row: BusinessRow): Business => ({
  id: row.id,
  name: row.name,
  country: row.country,
  subdomain: row.subdomain,
  createdAt: row.created_at.toISOString(),
});

export interface CreateBusinessInput {
  name: string;
  country: string;
  subdomain: string;
  admin: { email: string; name: string };
}

export interface UpdateBusinessInput {
  name?: string;
  subdomain?: string;
}

@Injectable()
export class BusinessService {
  constructor(
    @InjectDataSource('business_access')
    private readonly dataSource: DataSource,
    private readonly access: AccessControl,
    private readonly invitations: InvitationService,
  ) {}

  /** Only the superadmin registers businesses, each with its first business admin (ADR-0020). */
  async create(
    actor: Actor,
    input: CreateBusinessInput,
  ): Promise<CreatedBusiness> {
    this.access.assertSuperadmin(actor);
    const { businessId, admin, pending } = await this.dataSource.transaction(
      async (manager) => {
        const [created] = await selectRows<{ id: string }>(
          manager,
          `INSERT INTO business_access.business (name, country) VALUES ($1, $2) RETURNING id`,
          [input.name, input.country],
        );
        await setCurrentSubdomain(manager, input.subdomain, {
          businessId: created.id,
          branchId: null,
        });
        const user = await findOrCreateAdminUser(
          manager,
          input.admin.email,
          input.admin.name,
        );
        await manager.query(
          `INSERT INTO business_access.role_assignment (user_id, business_id, role)
         VALUES ($1, $2, 'business_admin') ON CONFLICT DO NOTHING`,
          [user.id, created.id],
        );
        return {
          businessId: created.id,
          admin: user,
          pending: await this.invitations.isPending(user.id, manager),
        };
      },
    );

    const invitation = pending
      ? await this.invitations.issue(admin.id, actor.userId)
      : null;
    return {
      business: await this.load(this.dataSource.manager, businessId),
      admin,
      invitation,
    };
  }

  /** Every business for the superadmin; otherwise the ones where the actor has a role. */
  async list(actor: Actor, page: PageQuery): Promise<Page<Business>> {
    const after = page.cursor ? decodeCursor(page.cursor) : null;
    const rows = await selectRows<BusinessRow>(
      this.dataSource.manager,
      `${BUSINESS_SQL}
       WHERE ($1::boolean OR EXISTS (
               SELECT 1 FROM business_access.role_assignment r WHERE r.business_id = b.id AND r.user_id = $2))
         AND ($3::timestamptz IS NULL OR (b.created_at, b.id) < ($3::timestamptz, $4::uuid))
       ORDER BY b.created_at DESC, b.id DESC
       LIMIT $5`,
      [
        actor.isSuperadmin,
        actor.userId,
        after?.createdAt ?? null,
        after?.id ?? null,
        page.limit + 1,
      ],
    );
    return toPage(
      rows.map((row) => ({ ...row, createdAt: row.created_at })),
      page.limit,
      toBusiness,
    );
  }

  async get(actor: Actor, businessId: string): Promise<Business> {
    this.access.assertBusiness(actor, businessId, 'view');
    return this.load(this.dataSource.manager, businessId);
  }

  /** A new subdomain keeps the old one as an alias of this business (ADR-0018). */
  async update(
    actor: Actor,
    businessId: string,
    input: UpdateBusinessInput,
  ): Promise<Business> {
    this.access.assertBusiness(actor, businessId, 'administer');
    return this.dataSource.transaction(async (manager) => {
      const business = await this.load(manager, businessId);
      if (input.name !== undefined) {
        await changeRows(
          manager,
          `UPDATE business_access.business SET name = $2, updated_at = now() WHERE id = $1`,
          [businessId, input.name],
        );
      }
      if (input.subdomain !== undefined) {
        await setCurrentSubdomain(manager, input.subdomain, {
          businessId: business.id,
          branchId: null,
        });
      }
      return this.load(manager, businessId);
    });
  }

  private async load(
    manager: EntityManager,
    businessId: string,
  ): Promise<Business> {
    const [row] = await selectRows<BusinessRow>(
      manager,
      `${BUSINESS_SQL} WHERE b.id = $1`,
      [businessId],
    );
    if (!row) throw notFound();
    return toBusiness(row);
  }
}
