import { Module } from '@nestjs/common';
import { ConfigModule } from './infrastructure/config/config.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { CatalogWorkerModule } from './modules/catalog';
import { InteractionsWorkerModule } from './modules/interactions';

/** The background worker process: the same code as the API, without HTTP (ADR-0006). */
@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    CatalogWorkerModule,
    InteractionsWorkerModule,
  ],
})
export class WorkerModule {}
