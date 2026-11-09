import { Module } from '@nestjs/common';
import { ConfigModule } from './infrastructure/config/config.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { HealthModule } from './infrastructure/health/health.module';
import { BusinessAccessModule } from './modules/business-access';
import { CatalogModule } from './modules/catalog';
import { DinersModule } from './modules/diners';
import { InteractionsModule } from './modules/interactions';
import { MeasurementModule } from './modules/measurement';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    HealthModule,
    BusinessAccessModule,
    CatalogModule,
    DinersModule,
    InteractionsModule,
    MeasurementModule,
  ],
})
export class AppModule {}
