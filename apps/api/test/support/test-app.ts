import type { DynamicModule, INestApplication, Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
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
  /** Extra modules the test needs, such as DiscoveryModule. */
  imports?: (Type | DynamicModule)[];
}

/**
 * The real application, wired to the real local services, set up exactly as main.ts does.
 * It trusts one proxy, so each test file can act from its own client IP (X-Forwarded-For)
 * and the login limits of one test never block the logins of another.
 */
export async function createTestApp(
  options: TestAppOptions = {},
): Promise<INestApplication<App>> {
  const base: AppConfig = {
    ...parseEnvironment(process.env),
    trustProxyHops: 1,
  };
  const config = options.configure ? options.configure(base) : base;
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule, ...(options.imports ?? [])],
    controllers: options.controllers ?? [],
  })
    .overrideProvider(APP_CONFIG)
    .useValue(config)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    logger: false,
  });
  configureApp(app, config);
  await app.init();
  return app as unknown as INestApplication<App>;
}
