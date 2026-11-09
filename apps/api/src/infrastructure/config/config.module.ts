import { Global, Module } from '@nestjs/common';
import { parseEnvironment } from './environment';

/** Injection token for the validated, typed configuration (see AppConfig). */
export const APP_CONFIG = Symbol('APP_CONFIG');

/**
 * The only place where the API reads process.env. Parsing happens once, while the
 * application boots, so a missing or invalid variable stops it before it serves.
 */
@Global()
@Module({
  providers: [
    { provide: APP_CONFIG, useFactory: () => parseEnvironment(process.env) },
  ],
  exports: [APP_CONFIG],
})
export class ConfigModule {}
