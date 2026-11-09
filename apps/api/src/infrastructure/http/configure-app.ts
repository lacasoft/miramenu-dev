import type { INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import type { AppConfig } from '../config/environment';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { requestIdMiddleware } from './request-id';
import { createValidationPipe } from './request-validation';

/**
 * HTTP setup shared by main.ts and the e2e tests, so tests exercise exactly what runs.
 * CORS stays off unless an allowlist is configured: behind the proxy the apps and the API
 * share the site, and a wildcard origin is never allowed.
 */
export function configureApp(app: INestApplication, config: AppConfig): void {
  app.use(requestIdMiddleware);
  app.use(helmet());
  if (config.corsAllowedOrigins.length > 0) {
    app.enableCors({ origin: config.corsAllowedOrigins, credentials: true });
  }
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
}
