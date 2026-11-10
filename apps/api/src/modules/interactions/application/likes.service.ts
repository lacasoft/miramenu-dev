import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { LikeState, MyLikes } from '@miramenu/contracts';
import type { DataSource } from 'typeorm';
import { changeRows, selectRows } from '../../../infrastructure/database/query';
import { MenuDishes } from '../../catalog';
import type { IdentifiedDiner } from '../../diners';
import { likeOwnerOf, type LikeOwner } from '../domain/interaction-rules';
import { deviceRequired, dishNotOnMenu } from './errors';

/** The owner's condition, matching the partial unique index of its kind. */
const ownerFilter = (owner: LikeOwner, from: number) =>
  owner.kind === 'diner'
    ? { sql: `diner_id = $${from}`, values: [owner.dinerId] }
    : {
        sql: `diner_id IS NULL AND device_id = $${from}`,
        values: [owner.deviceId],
      };

/**
 * Likes of a dish in a branch (design: "Like por platillo y sucursal"). Setting one is
 * idempotent: repeating it changes nothing. Only dishes on the branch's published menu
 * can be liked (Catalog's contract); taking a like back needs no such check.
 */
@Injectable()
export class LikesService {
  constructor(
    @InjectDataSource('interactions') private readonly dataSource: DataSource,
    private readonly menuDishes: MenuDishes,
  ) {}

  async set(
    branchId: string,
    dishId: string,
    identity: IdentifiedDiner,
    active: boolean,
  ): Promise<LikeState> {
    const owner = likeOwnerOf(identity);
    if (owner === null) throw deviceRequired();
    const manager = this.dataSource.manager;
    if (active) {
      if (!(await this.menuDishes.isOnMenu(branchId, dishId)))
        throw dishNotOnMenu();
      await manager.query(
        owner.kind === 'diner'
          ? `INSERT INTO interactions.dish_like (branch_id, dish_id, diner_id, device_id)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (branch_id, dish_id, diner_id) WHERE diner_id IS NOT NULL DO NOTHING`
          : `INSERT INTO interactions.dish_like (branch_id, dish_id, device_id)
             VALUES ($1, $2, $3)
             ON CONFLICT (branch_id, dish_id, device_id) WHERE diner_id IS NULL DO NOTHING`,
        owner.kind === 'diner'
          ? [branchId, dishId, owner.dinerId, owner.deviceId]
          : [branchId, dishId, owner.deviceId],
      );
    } else {
      const filter = ownerFilter(owner, 3);
      await changeRows(
        manager,
        `DELETE FROM interactions.dish_like WHERE branch_id = $1 AND dish_id = $2 AND ${filter.sql}`,
        [branchId, dishId, ...filter.values],
      );
    }
    const [count] = await selectRows<{ likes: string }>(
      manager,
      `SELECT count(*) AS likes FROM interactions.dish_like WHERE branch_id = $1 AND dish_id = $2`,
      [branchId, dishId],
    );
    return { active, likes: Number(count.likes) };
  }

  /** The dishes of a branch this diner, or this anonymous device, likes. */
  async mine(branchId: string, identity: IdentifiedDiner): Promise<MyLikes> {
    const owner = likeOwnerOf(identity);
    if (owner === null) throw deviceRequired();
    const filter = ownerFilter(owner, 2);
    const rows = await selectRows<{ dish_id: string }>(
      this.dataSource.manager,
      `SELECT dish_id FROM interactions.dish_like WHERE branch_id = $1 AND ${filter.sql} ORDER BY dish_id`,
      [branchId, ...filter.values],
    );
    return { dishIds: rows.map((row) => row.dish_id) };
  }
}
