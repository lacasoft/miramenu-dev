import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource, EntityManager } from 'typeorm';
import { selectRows } from '../../../infrastructure/database/query';

/** Serializes the notices' inserts: whoever holds it takes the next position and commits. */
const OUTBOX_LOCK = '4600000001';
export const DINER_REGISTRATIONS_PAGE_MAX = 500;

/**
 * Notice that a device passed to a diner's account (design: "Aviso ComensalRegistrado,
 * con el dispositivo que pasa a la cuenta"). Interacciones moves that device's likes.
 */
export interface DinerRegistered {
  /** Increasing, with gaps; a reader keeps the last one it processed. */
  position: number;
  eventId: string;
  dinerId: string;
  deviceId: string;
  occurredAt: Date;
}

interface NoticeRow {
  position: string;
  event_id: string;
  diner_id: string;
  device_id: string;
  occurred_at: Date;
}

/**
 * The outbox of DinerRegistered (design, step 6): each notice is written in the same
 * transaction as the registration, and readers take them in order by position. The
 * advisory lock makes positions commit in order, so reading "after N" never skips a
 * notice that commits late. Registrations are rare, so the lock costs nothing.
 */
@Injectable()
export class DinerRegistrations {
  constructor(
    @InjectDataSource('diners') private readonly dataSource: DataSource,
  ) {}

  async record(
    manager: EntityManager,
    dinerId: string,
    deviceId: string,
    occurredAt: Date,
  ): Promise<void> {
    await manager.query(`SELECT pg_advisory_xact_lock($1::bigint)`, [
      OUTBOX_LOCK,
    ]);
    await manager.query(
      `INSERT INTO diners.diner_registered (diner_id, device_id, occurred_at) VALUES ($1, $2, $3)`,
      [dinerId, deviceId, occurredAt],
    );
  }

  /** The notices after a position, oldest first; 0 reads from the beginning. */
  async after(position: number, limit: number): Promise<DinerRegistered[]> {
    const rows = await selectRows<NoticeRow>(
      this.dataSource.manager,
      `SELECT position, event_id, diner_id, device_id, occurred_at
       FROM diners.diner_registered WHERE position > $1 ORDER BY position LIMIT $2`,
      [position, Math.min(Math.max(limit, 1), DINER_REGISTRATIONS_PAGE_MAX)],
    );
    return rows.map((row) => ({
      position: Number(row.position),
      eventId: row.event_id,
      dinerId: row.diner_id,
      deviceId: row.device_id,
      occurredAt: row.occurred_at,
    }));
  }
}
