import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { InvitationService } from './invitation.service';
import { selectRows } from './sql';

export interface SeedSuperadminInput {
  email: string;
  name: string;
  /** Sends a new invitation to the existing superadmin while it has not set a password. */
  resend: boolean;
}

/**
 * RNF-08: the superadmin only exists in the seed. It is created through a connection as
 * the schema owner, because the API role has no privilege on is_superadmin, and the
 * database refuses a second one. Its password is set through an invitation, like any admin.
 */
@Injectable()
export class SuperadminSeeder {
  constructor(private readonly invitations: InvitationService) {}

  async seed(
    owner: EntityManager,
    input: SeedSuperadminInput,
  ): Promise<{ userId: string; sent: boolean }> {
    const [existing] = await selectRows<{
      id: string;
      email: string;
      pending: boolean;
    }>(
      owner,
      `SELECT id, email, password_hash IS NULL AS pending FROM business_access.admin_user WHERE is_superadmin`,
    );

    if (existing) {
      if (!input.resend)
        throw new Error(
          'A superadmin already exists; there can only be one (RNF-08)',
        );
      if (existing.email !== input.email)
        throw new Error('The existing superadmin has a different email');
      if (!existing.pending)
        throw new Error(
          'The superadmin already set a password; nothing to resend',
        );
      return {
        userId: existing.id,
        ...(await this.invitations.issue(existing.id, null)),
      };
    }
    if (input.resend)
      throw new Error(
        'There is no superadmin yet; run the seed without --resend',
      );

    const [created] = await selectRows<{ id: string }>(
      owner,
      `INSERT INTO business_access.admin_user (email, name, is_superadmin) VALUES ($1, $2, true)
       ON CONFLICT (email) DO NOTHING RETURNING id`,
      [input.email, input.name],
    );
    if (!created)
      throw new Error(
        'That email already belongs to an admin; the superadmin needs its own',
      );
    return {
      userId: created.id,
      ...(await this.invitations.issue(created.id, null)),
    };
  }
}
