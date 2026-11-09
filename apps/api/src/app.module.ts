import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { NegociosModule } from './modules/negocios/negocios.module';
import { CatalogoModule } from './modules/catalogo/catalogo.module';
import { ComensalesModule } from './modules/comensales/comensales.module';
import { InteraccionesModule } from './modules/interacciones/interacciones.module';
import { MedicionModule } from './modules/medicion/medicion.module';

@Module({
  imports: [NegociosModule, CatalogoModule, ComensalesModule, InteraccionesModule, MedicionModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
