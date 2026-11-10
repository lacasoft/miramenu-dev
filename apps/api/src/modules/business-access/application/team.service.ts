import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  type AdminRole,
  BUSINESS_ACCESS_ERROR_CODES,
  type BusinessUser,
  type InvitedUser,
  type Page,
  type PageQuery,
  type RoleAssignment,
} from '@miramenu/contracts';
import type { DataSource, EntityManager } from 'typeorm';
import { ApiException } from '../../../infrastructure/http/api-exception';
import {
  decodeCursor,
  toPage,
} from '../../../infrastructure/http/keyset-cursor';
import type { Actor } from '../domain/actor';
import { AccessControl, notFound } from './access-control';
import { findOrCreateAdminUser } from './identifiers';
import { InvitationService } from './invitation.service';
import { changeRows, selectRows } from '../../../infrastructure/database/query';

export interface RoleTarget {
  role: AdminRole;
  branchId?: string;
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  pending: boolean;
  created_at: Date;
}

interface RoleRow {
  user_id: string;
  business_id: string;
  branch_id: string | null;
  role: AdminRole;
}

const branchNotInBusiness = () =>
  new ApiException(
    400,
    BUSINESS_ACCESS_ERROR_CODES.BRANCH_NOT_IN_BUSINESS,
    'Branch does not belong to the business',
  );

/**
 * The people of a business and their roles (ADR-0020): only its business admins and the
 * superadmin manage them, always inside that business. Superadmin is not a role here.
 */
@Injectable()
export class TeamService {
  constructor(
    @InjectDataSource('business_access')
    private readonly dataSource: DataSource,
    private readonly access: AccessControl,
    private readonly invitations: InvitationService,
  ) {}

  async list(
    actor: Actor,
    businessId: string,
    page: PageQuery,
  ): Promise<Page<BusinessUser>> {
    this.access.assertBusiness(actor, businessId, 'administer');
    const after = page.cursor ? decodeCursor(page.cursor) : null;
    const users = await selectRows<UserRow>(
      this.dataSource.manager,
      `SELECT u.id, u.email, u.name, u.password_hash IS NULL AS pending, u.created_at
       FROM business_access.admin_user u
       WHERE EXISTS (SELECT 1 FROM business_access.role_assignment r WHERE r.user_id = u.id AND r.business_id = $1)
         AND ($2::timestamptz IS NULL OR (u.created_at, u.id) < ($2::timestamptz, $3::uuid))
       ORDER BY u.created_at DESC, u.id DESC
       LIMIT $4`,
      [businessId, after?.createdAt ?? null, after?.id ?? null, page.limit + 1],
    );
    const roles = await this.rolesOf(
      this.dataSource.manager,
      businessId,
      users.map((user) => user.id),
    );
    return toPage(
      users.map((user) => ({ ...user, createdAt: user.created_at })),
      page.limit,
      (user) => this.toBusinessUser(user, roles),
    );
  }

  /** Adds a role to a person, creating the admin if new; a new admin gets the invitation. */
  async invite(
    actor: Actor,
    businessId: string,
    input: { email: string; name: string; role: RoleTarget },
  ): Promise<InvitedUser> {
    this.access.assertBusiness(actor, businessId, 'administer');
    const { userId, pending } = await this.dataSource.transaction(
      async (manager) => {
        await this.assertBranchesBelong(manager, businessId, [input.role]);
        const user = await findOrCreateAdminUser(
          manager,
          input.email,
          input.name,
        );
        await this.insertRoles(manager, user.id, businessId, [input.role]);
        return {
          userId: user.id,
          pending: await this.invitations.isPending(user.id, manager),
        };
      },
    );
    const invitation = pending
      ? await this.invitations.issue(userId, actor.userId)
      : null;
    return { user: await this.member(businessId, userId), invitation };
  }

  /** Replaces a member's roles in this business, leaving their roles elsewhere untouched. */
  async setRoles(
    actor: Actor,
    businessId: string,
    userId: string,
    roles: RoleTarget[],
  ): Promise<BusinessUser> {
    this.access.assertBusiness(actor, businessId, 'administer');
    await this.dataSource.transaction(async (manager) => {
      await this.assertMember(manager, businessId, userId);
      await this.assertBranchesBelong(manager, businessId, roles);
      await changeRows(
        manager,
        `DELETE FROM business_access.role_assignment WHERE business_id = $1 AND user_id = $2`,
        [businessId, userId],
      );
      await this.insertRoles(manager, userId, businessId, roles);
    });
    return this.member(businessId, userId);
  }

  /** Removes the person from this business; permissions are re-read on every request. */
  async removeRoles(
    actor: Actor,
    businessId: string,
    userId: string,
  ): Promise<void> {
    this.access.assertBusiness(actor, businessId, 'administer');
    const removed = await changeRows(
      this.dataSource.manager,
      `DELETE FROM business_access.role_assignment WHERE business_id = $1 AND user_id = $2`,
      [businessId, userId],
    );
    if (removed === 0) throw notFound();
  }

  /** A new invitation invalidates the previous one (ADR-0023). */
  async resendInvitation(
    actor: Actor,
    businessId: string,
    userId: string,
  ): Promise<{ sent: boolean }> {
    this.access.assertBusiness(actor, businessId, 'administer');
    await this.assertMember(this.dataSource.manager, businessId, userId);
    if (!(await this.invitations.isPending(userId))) {
      throw new ApiException(
        409,
        BUSINESS_ACCESS_ERROR_CODES.USER_ALREADY_ACTIVE,
        'User already set a password',
      );
    }
    return this.invitations.issue(userId, actor.userId);
  }

  private async member(
    businessId: string,
    userId: string,
  ): Promise<BusinessUser> {
    const [user] = await selectRows<UserRow>(
      this.dataSource.manager,
      `SELECT id, email, name, password_hash IS NULL AS pending, created_at FROM business_access.admin_user WHERE id = $1`,
      [userId],
    );
    if (!user) throw notFound();
    return this.toBusinessUser(
      user,
      await this.rolesOf(this.dataSource.manager, businessId, [userId]),
    );
  }

  private async assertMember(
    manager: EntityManager,
    businessId: string,
    userId: string,
  ): Promise<void> {
    const [membership] = await selectRows(
      manager,
      `SELECT 1 FROM business_access.role_assignment WHERE business_id = $1 AND user_id = $2 LIMIT 1`,
      [businessId, userId],
    );
    if (!membership) throw notFound();
  }

  private async assertBranchesBelong(
    manager: EntityManager,
    businessId: string,
    roles: RoleTarget[],
  ): Promise<void> {
    const branchIds = roles.flatMap((role) =>
      role.branchId ? [role.branchId] : [],
    );
    if (branchIds.length === 0) return;
    const found = await selectRows<{ id: string }>(
      manager,
      `SELECT id FROM business_access.branch WHERE business_id = $1 AND id = ANY($2::uuid[])`,
      [businessId, branchIds],
    );
    if (found.length !== new Set(branchIds).size) throw branchNotInBusiness();
  }

  private async insertRoles(
    manager: EntityManager,
    userId: string,
    businessId: string,
    roles: RoleTarget[],
  ): Promise<void> {
    for (const role of roles) {
      await manager.query(
        `INSERT INTO business_access.role_assignment (user_id, business_id, branch_id, role)
         VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
        [userId, businessId, role.branchId ?? null, role.role],
      );
    }
  }

  private async rolesOf(
    manager: EntityManager,
    businessId: string,
    userIds: string[],
  ): Promise<RoleRow[]> {
    if (userIds.length === 0) return [];
    return selectRows<RoleRow>(
      manager,
      `SELECT user_id, business_id, branch_id, role FROM business_access.role_assignment
       WHERE business_id = $1 AND user_id = ANY($2::uuid[])
       ORDER BY role, branch_id NULLS FIRST`,
      [businessId, userIds],
    );
  }

  private toBusinessUser(user: UserRow, roles: RoleRow[]): BusinessUser {
    const assignments: RoleAssignment[] = roles
      .filter((role) => role.user_id === user.id)
      .map((role) => ({
        businessId: role.business_id,
        branchId: role.branch_id,
        role: role.role,
      }));
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      status: user.pending ? 'invited' : 'active',
      roles: assignments,
    };
  }
}
