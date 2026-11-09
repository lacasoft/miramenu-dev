import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/environment';
import { contextConnectionOptions } from './context-connection-options';
import { DATABASE_CONTEXTS } from './database-contexts';

/**
 * Registers one named TypeORM connection per bounded context. A context module reaches
 * its own data with TypeOrmModule.forFeature([...], '<context>') and nothing else.
 */
@Module({
  imports: DATABASE_CONTEXTS.map((context) =>
    TypeOrmModule.forRootAsync({
      name: context,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        contextConnectionOptions(config.database, context),
    }),
  ),
})
export class DatabaseModule {}
