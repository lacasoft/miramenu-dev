import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { selectRows } from '../../../infrastructure/database/query';

/**
 * "Nombre público" (design): the only thing about a diner other contexts may see. It
 * never returns the phone or the email (ADR-0007: "el negocio solo ve el nombre").
 */
@Injectable()
export class DinerDirectory {
  constructor(
    @InjectDataSource('diners') private readonly dataSource: DataSource,
  ) {}

  /** Names by diner id; unknown ids are simply missing from the map. */
  async publicNames(dinerIds: readonly string[]): Promise<Map<string, string>> {
    if (dinerIds.length === 0) return new Map();
    const rows = await selectRows<{ id: string; name: string }>(
      this.dataSource.manager,
      `SELECT id, name FROM diners.diner WHERE id = ANY($1::uuid[])`,
      [[...new Set(dinerIds)]],
    );
    return new Map(rows.map((row) => [row.id, row.name]));
  }
}
