import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BusinessAccessModule } from './modules/business-access';
import { CatalogModule } from './modules/catalog';
import { DinersModule } from './modules/diners';
import { InteractionsModule } from './modules/interactions';
import { MeasurementModule } from './modules/measurement';

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
