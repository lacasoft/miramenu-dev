import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BusinessAccessModule } from './modules/business-access/business-access.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { DinersModule } from './modules/diners/diners.module';
import { InteractionsModule } from './modules/interactions/interactions.module';
import { MeasurementModule } from './modules/measurement/measurement.module';

@Module({
  imports: [
    BusinessAccessModule,
    CatalogModule,
    DinersModule,
    InteractionsModule,
    MeasurementModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
