import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource, EntityManager } from 'typeorm';
import { selectRows } from '../../../infrastructure/database/query';
import { DinerRegistrations } from './diner-registrations';
import { DinerSessions } from './diner-sessions';

export interface Registration {
  phone: string;
  name: string;
  email?: string;
  offersConsent: boolean;
  privacyNoticeVersion: string;
  deviceId: string;
  now: Date;
}

export interface RegisteredDiner {
  diner: { id: string; name: string };
  session: { token: string; expiresAt: Date };
}

/**
 * The account behind a validated phone (ADR-0007): one per number, for every business.
 * Everything a registration writes goes in one transaction: the account, the device
 * that passes to it, its notice, the consents and the session (design, step 6).
 */
@Injectable()
export class DinerAccounts {
  constructor(
    @InjectDataSource('diners') private readonly dataSource: DataSource,
    private readonly registrations: DinerRegistrations,
    private readonly sessions: DinerSessions,
  ) {}

  register(registration: Registration): Promise<RegisteredDiner> {
    return this.dataSource.transaction(async (manager) => {
      const diner = await this.upsertDiner(manager, registration);
      if (await this.linkDevice(manager, diner.id, registration)) {
        await this.registrations.record(
          manager,
          diner.id,
          registration.deviceId,
          registration.now,
        );
      }
      await this.grant(manager, diner.id, 'privacy_notice', registration);
      if (registration.offersConsent)
        await this.grant(manager, diner.id, 'offers', registration);
      const session = await this.sessions.open(
        manager,
        diner.id,
        registration.deviceId,
        registration.now,
      );
      return { diner, session };
    });
  }

  /** A known phone signs in again: the name is the latest given, the email is kept if absent. */
  private async upsertDiner(
    manager: EntityManager,
    registration: Registration,
  ): Promise<{ id: string; name: string }> {
    const [diner] = await selectRows<{ id: string; name: string }>(
      manager,
      `INSERT INTO diners.diner (phone, name, email, validated_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $4, $4)
       ON CONFLICT (phone) DO UPDATE SET
         name = EXCLUDED.name,
         email = COALESCE(EXCLUDED.email, diner.email),
         validated_at = EXCLUDED.validated_at,
         updated_at = EXCLUDED.updated_at
       RETURNING id, name`,
      [
        registration.phone,
        registration.name,
        registration.email ?? null,
        registration.now,
      ],
    );
    return diner;
  }

  /**
   * True when the device passes to this account: first seen, or linked to another one.
   * A device already linked to this account changes nothing and leaves no new notice.
   */
  private async linkDevice(
    manager: EntityManager,
    dinerId: string,
    registration: Registration,
  ): Promise<boolean> {
    const linked = await selectRows<{ id: string }>(
      manager,
      `INSERT INTO diners.device (id, diner_id, linked_at) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET diner_id = EXCLUDED.diner_id, linked_at = EXCLUDED.linked_at
       WHERE device.diner_id <> EXCLUDED.diner_id
       RETURNING id`,
      [registration.deviceId, dinerId, registration.now],
    );
    return linked.length > 0;
  }

  private async grant(
    manager: EntityManager,
    dinerId: string,
    kind: 'privacy_notice' | 'offers',
    registration: Registration,
  ): Promise<void> {
    await manager.query(
      `INSERT INTO diners.consent (diner_id, kind, notice_version, granted_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (diner_id, kind) DO UPDATE SET
         notice_version = EXCLUDED.notice_version,
         granted_at = EXCLUDED.granted_at`,
      [dinerId, kind, registration.privacyNoticeVersion, registration.now],
    );
  }
}
