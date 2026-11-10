import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';

/**
 * Keeps the daily partitions of the feed entries (ADR-0014, ADR-0041) through the one
 * function the API role may call: it creates the next days and drops those past 90. The
 * function takes no arguments, so nothing here can make it drop recent data.
 */
@Injectable()
export class PartitionMaintenance {
  constructor(
    @InjectDataSource('measurement') private readonly dataSource: DataSource,
  ) {}

  async run(): Promise<void> {
    await this.dataSource.query(
      `SELECT measurement.maintain_feed_entry_partitions()`,
    );
  }
}
