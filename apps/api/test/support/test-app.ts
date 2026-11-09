import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { APP_CONFIG } from '../../src/infrastructure/config/config.module';
import {
  type AppConfig,
  parseEnvironment,
} from '../../src/infrastructure/config/environment';
import { configureApp } from '../../src/infrastructure/http/configure-app';

interface TestAppOptions {
  /** Changes the configuration, e.g. to point a dependency somewhere unreachable. */
  configure?: (config: AppConfig) => AppConfig;
  /** Extra controllers that only exist in the test, to exercise the HTTP setup. */
  controllers?: Type[];
}

/** The real application, wired to the real local services, set up exactly as main.ts does. */
export async function createTestApp(
  options: TestAppOptions = {},
): Promise<INestApplication<App>> {
  const base = parseEnvironment(process.env);
  const config = options.configure ? options.configure(base) : base;
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers: options.controllers ?? [],
  })
    .overrideProvider(APP_CONFIG)
    .useValue(config)
    .compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>({
    logger: false,
  });
  configureApp(app, config);
  await app.init();
  return app;
}
