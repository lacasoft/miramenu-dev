import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { QueryFailedError, type DataSource } from 'typeorm';
import { changeRows, selectRows } from '../../../infrastructure/database/query';
import { type DinerRegistered, DinerRegistrations } from '../../diners';

/** Notices read per round. */
const BATCH = 100;
/** Postgres lock_not_available: another worker is applying notices right now. */
const LOCK_NOT_AVAILABLE = '55P03';

type Outcome = 'applied' | 'skipped' | 'busy';

const isLockNotAvailable = (error: unknown): boolean =>
  error instanceof QueryFailedError &&
  typeof error.driverError === 'object' &&
  error.driverError !== null &&
  'code' in error.driverError &&
  error.driverError.code === LOCK_NOT_AVAILABLE;

/**
 * Moves a device's anonymous likes to the diner's account when it registers (design,
 * flujo de registro, paso 6; ADR-0040). Diners never touches likes: it leaves a
 * DinerRegistered notice and this reads them in order, each in one transaction that
 * also moves the cursor, so a notice is applied once even if the worker dies mid-way.
 */
@Injectable()
export class LikeTransfer {
  constructor(
    @InjectDataSource('interactions') private readonly dataSource: DataSource,
    private readonly registrations: DinerRegistrations,
  ) {}

  /** Applies every pending notice; returns how many it applied. */
  async processPending(now: Date = new Date()): Promise<number> {
    let applied = 0;
    for (;;) {
      const notices = await this.registrations.after(
        await this.position(),
        BATCH,
      );
      if (notices.length === 0) return applied;
      for (const notice of notices) {
        const outcome = await this.apply(notice, now);
        if (outcome === 'busy') return applied;
        if (outcome === 'applied') applied += 1;
      }
    }
  }

  private async position(): Promise<number> {
    const [cursor] = await selectRows<{ position: string }>(
      this.dataSource.manager,
      `SELECT position FROM interactions.registration_cursor`,
    );
    return Number(cursor.position);
  }

  private async apply(notice: DinerRegistered, now: Date): Promise<Outcome> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        // NOWAIT: with several workers, whoever holds the cursor applies; the rest wait
        // for their next round instead of queueing behind it.
        const [cursor] = await selectRows<{ position: string }>(
          manager,
          `SELECT position FROM interactions.registration_cursor FOR UPDATE NOWAIT`,
        );
        if (Number(cursor.position) >= notice.position) return 'skipped';
        // design: "Si ya tenía like en el mismo platillo desde otro celular, queda uno solo".
        const merged = await changeRows(
          manager,
          `DELETE FROM interactions.dish_like anonymous
           WHERE anonymous.diner_id IS NULL AND anonymous.device_id = $1
             AND EXISTS (
               SELECT 1 FROM interactions.dish_like account
               WHERE account.diner_id = $2
                 AND account.branch_id = anonymous.branch_id
                 AND account.dish_id = anonymous.dish_id
             )`,
          [notice.deviceId, notice.dinerId],
        );
        const moved = await changeRows(
          manager,
          `UPDATE interactions.dish_like SET diner_id = $2
           WHERE diner_id IS NULL AND device_id = $1`,
          [notice.deviceId, notice.dinerId],
        );
        await manager.query(
          `INSERT INTO interactions.transferred_device
             (position, device_id, diner_id, moved_likes, merged_likes, transferred_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            notice.position,
            notice.deviceId,
            notice.dinerId,
            moved,
            merged,
            now,
          ],
        );
        await changeRows(
          manager,
          `UPDATE interactions.registration_cursor SET position = $1, updated_at = $2`,
          [notice.position, now],
        );
        return 'applied';
      });
    } catch (error) {
      if (isLockNotAvailable(error)) return 'busy';
      throw error;
    }
  }
}
