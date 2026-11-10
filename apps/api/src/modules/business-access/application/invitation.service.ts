import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { BUSINESS_ACCESS_ERROR_CODES } from '@miramenu/contracts';
import type { DataSource, EntityManager } from 'typeorm';
import { APP_CONFIG } from '../../../infrastructure/config/config.module';
import type { AppConfig } from '../../../infrastructure/config/environment';
import { ApiException } from '../../../infrastructure/http/api-exception';
import { Mailer } from '../../../infrastructure/mail/mailer';
import { hashPassword } from '../domain/password';
import {
  generateSecretToken,
  hashSecretToken,
} from '../../../infrastructure/security/secret-token';
import { invitationEmail } from './invitation-email';
import { changeRows, selectRows } from '../../../infrastructure/database/query';

/** The design fixes it: an invitation link works for 48 hours (ADR-0023). */
const INVITATION_TTL_MS = 48 * 60 * 60 * 1000;

interface InvitationRow {
  id: string;
  user_id: string;
  expires_at: Date;
}

/** One-use invitations to set the password (ADR-0023, ADR-0033). */
@Injectable()
export class InvitationService {
  private readonly logger = new Logger(InvitationService.name);

  constructor(
    @InjectDataSource('business_access')
    private readonly dataSource: DataSource,
    private readonly mailer: Mailer,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * Issues a new invitation, which invalidates any pending one, and emails it. A mail
   * failure does not undo anything: sent is false and the inviter resends later.
   */
  async issue(
    userId: string,
    invitedBy: string | null,
  ): Promise<{ sent: boolean }> {
    const token = generateSecretToken();
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
    const user = await this.dataSource.transaction(async (manager) => {
      await this.revokePending(manager, userId);
      await manager.query(
        `INSERT INTO business_access.admin_invitation (user_id, token_hash, invited_by, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [userId, hashSecretToken(token), invitedBy, expiresAt],
      );
      const [row] = await selectRows<{ email: string; name: string }>(
        manager,
        `SELECT email, name FROM business_access.admin_user WHERE id = $1`,
        [userId],
      );
      return row;
    });

    try {
      const link = `${this.config.adminAppUrl}/invitation#token=${token}`;
      await this.mailer.send(
        invitationEmail({ to: user.email, name: user.name, link, expiresAt }),
      );
      return { sent: true };
    } catch (error) {
      this.logger.warn({
        message: 'Invitation email could not be sent',
        userId,
        reason: (error as Error).message,
      });
      return { sent: false };
    }
  }

  /**
   * Sets the password with a valid invitation; the invitation then stops working. The
   * token is checked before hashing, so forged tokens cannot make the API spend 128 MiB
   * of scrypt each; the row is re-checked under lock in case of a concurrent accept.
   */
  async accept(token: string, password: string): Promise<void> {
    const tokenHash = hashSecretToken(token);
    this.assertUsable(
      await this.findPending(this.dataSource.manager, tokenHash, false),
    );
    const passwordHash = await hashPassword(password);
    await this.dataSource.transaction(async (manager) => {
      const invitation = this.assertUsable(
        await this.findPending(manager, tokenHash, true),
      );
      await changeRows(
        manager,
        `UPDATE business_access.admin_user SET password_hash = $2, updated_at = now() WHERE id = $1`,
        [invitation.user_id, passwordHash],
      );
      await changeRows(
        manager,
        `UPDATE business_access.admin_invitation SET used_at = now() WHERE id = $1`,
        [invitation.id],
      );
      await this.revokePending(manager, invitation.user_id);
    });
  }

  private async findPending(
    manager: EntityManager,
    tokenHash: Buffer,
    lock: boolean,
  ): Promise<InvitationRow | undefined> {
    const [invitation] = await selectRows<InvitationRow>(
      manager,
      `SELECT id, user_id, expires_at FROM business_access.admin_invitation
       WHERE token_hash = $1 AND used_at IS NULL AND revoked_at IS NULL${lock ? ' FOR UPDATE' : ''}`,
      [tokenHash],
    );
    return invitation;
  }

  private assertUsable(invitation: InvitationRow | undefined): InvitationRow {
    if (!invitation) {
      throw new ApiException(
        404,
        BUSINESS_ACCESS_ERROR_CODES.INVITATION_NOT_FOUND,
        'Invitation not found',
      );
    }
    if (invitation.expires_at.getTime() <= Date.now()) {
      throw new ApiException(
        410,
        BUSINESS_ACCESS_ERROR_CODES.INVITATION_EXPIRED,
        'Invitation expired',
      );
    }
    return invitation;
  }

  /** Whether the user still has to accept an invitation (no password yet). */
  async isPending(
    userId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<boolean> {
    const [user] = await selectRows<{ pending: boolean }>(
      manager,
      `SELECT password_hash IS NULL AS pending FROM business_access.admin_user WHERE id = $1`,
      [userId],
    );
    return user?.pending ?? false;
  }

  private async revokePending(
    manager: EntityManager,
    userId: string,
  ): Promise<void> {
    await changeRows(
      manager,
      `UPDATE business_access.admin_invitation SET revoked_at = now()
       WHERE user_id = $1 AND used_at IS NULL AND revoked_at IS NULL`,
      [userId],
    );
  }
}
