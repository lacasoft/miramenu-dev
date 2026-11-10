import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource, EntityManager } from 'typeorm';
import { APP_CONFIG } from '../../../infrastructure/config/config.module';
import type { AppConfig } from '../../../infrastructure/config/environment';
import { changeRows, selectRows } from '../../../infrastructure/database/query';
import {
  generateSecretToken,
  hashSecretToken,
} from '../../../infrastructure/security/secret-token';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SessionDiner {
  dinerId: string;
  name: string;
  deviceId: string;
}

/**
 * Opaque sessions of registered diners, like the admin's (ADR-0028): the token goes to
 * the cookie and only its hash to the database. They last DINER_SESSION_DAYS, without
 * an idle limit: a diner comes back to a restaurant weeks later (ADR-0039).
 */
@Injectable()
export class DinerSessions {
  private readonly days: number;

  constructor(
    @InjectDataSource('diners') private readonly dataSource: DataSource,
    @Inject(APP_CONFIG) config: AppConfig,
  ) {
    this.days = config.dinerSession.days;
  }

  /** Inside the registration's transaction, so a session never exists without its account. */
  async open(
    manager: EntityManager,
    dinerId: string,
    deviceId: string,
    now: Date,
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = generateSecretToken();
    const expiresAt = new Date(now.getTime() + this.days * DAY_MS);
    await manager.query(
      `INSERT INTO diners.diner_session (diner_id, device_id, token_hash, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [dinerId, deviceId, hashSecretToken(token), now, expiresAt],
    );
    return { token, expiresAt };
  }

  async authenticate(token: string, now: Date): Promise<SessionDiner | null> {
    const [session] = await selectRows<{
      diner_id: string;
      name: string;
      device_id: string;
    }>(
      this.dataSource.manager,
      `SELECT s.diner_id, d.name, s.device_id
       FROM diners.diner_session s JOIN diners.diner d ON d.id = s.diner_id
       WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > $2`,
      [hashSecretToken(token), now],
    );
    return session
      ? {
          dinerId: session.diner_id,
          name: session.name,
          deviceId: session.device_id,
        }
      : null;
  }

  async revoke(token: string, now: Date): Promise<void> {
    await changeRows(
      this.dataSource.manager,
      `UPDATE diners.diner_session SET revoked_at = $2 WHERE token_hash = $1 AND revoked_at IS NULL`,
      [hashSecretToken(token), now],
    );
  }
}
