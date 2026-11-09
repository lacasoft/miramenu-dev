import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { AdminRole } from '@miramenu/contracts';
import type { DataSource } from 'typeorm';
import { APP_CONFIG } from '../../../infrastructure/config/config.module';
import type { AppConfig } from '../../../infrastructure/config/environment';
import type { Actor } from '../domain/actor';
import { generateSecretToken, hashSecretToken } from '../domain/secret-token';
import { changeRows, selectRows } from './sql';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
/** last_seen_at is written at most once a minute, not on every request. */
const TOUCH_INTERVAL_MS = MINUTE_MS;

interface SessionRow {
  id: string;
  user_id: string;
  last_seen_at: Date;
  expires_at: Date;
}

interface ActorRow {
  id: string;
  email: string;
  name: string;
  is_superadmin: boolean;
}

interface RoleRow {
  business_id: string;
  branch_id: string | null;
  role: AdminRole;
}

/** Opaque admin sessions (ADR-0028, ADR-0035): 1 h idle, 12 h at most, by default. */
@Injectable()
export class AdminSessionService {
  constructor(
    @InjectDataSource('business_access')
    private readonly dataSource: DataSource,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Creates a session; the token goes to the cookie and only its hash to the database. */
  async open(
    userId: string,
    now: Date,
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = generateSecretToken();
    const expiresAt = new Date(
      now.getTime() + this.config.adminSession.absoluteHours * HOUR_MS,
    );
    await this.dataSource.query(
      `INSERT INTO business_access.admin_session (user_id, token_hash, last_seen_at, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [userId, hashSecretToken(token), now, expiresAt],
    );
    return { token, expiresAt };
  }

  /** The actor behind a valid session, or null if it is unknown, revoked, idle or expired. */
  async authenticate(token: string, now: Date): Promise<Actor | null> {
    const idleSince = new Date(
      now.getTime() - this.config.adminSession.idleMinutes * MINUTE_MS,
    );
    const [session] = await selectRows<SessionRow>(
      this.dataSource.manager,
      `SELECT id, user_id, last_seen_at, expires_at FROM business_access.admin_session
       WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > $2 AND last_seen_at > $3`,
      [hashSecretToken(token), now, idleSince],
    );
    if (!session) return null;
    if (now.getTime() - session.last_seen_at.getTime() >= TOUCH_INTERVAL_MS) {
      await changeRows(
        this.dataSource.manager,
        `UPDATE business_access.admin_session SET last_seen_at = $2 WHERE id = $1`,
        [session.id, now],
      );
    }
    return this.loadActor(session.user_id);
  }

  async revoke(token: string, now: Date): Promise<void> {
    await changeRows(
      this.dataSource.manager,
      `UPDATE business_access.admin_session SET revoked_at = $2 WHERE token_hash = $1 AND revoked_at IS NULL`,
      [hashSecretToken(token), now],
    );
  }

  private async loadActor(userId: string): Promise<Actor | null> {
    const [user] = await selectRows<ActorRow>(
      this.dataSource.manager,
      `SELECT id, email, name, is_superadmin FROM business_access.admin_user WHERE id = $1`,
      [userId],
    );
    if (!user) return null;
    const roles = await selectRows<RoleRow>(
      this.dataSource.manager,
      `SELECT business_id, branch_id, role FROM business_access.role_assignment WHERE user_id = $1`,
      [userId],
    );
    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      isSuperadmin: user.is_superadmin,
      roles: roles.map((role) => ({
        businessId: role.business_id,
        branchId: role.branch_id,
        role: role.role,
      })),
    };
  }
}
