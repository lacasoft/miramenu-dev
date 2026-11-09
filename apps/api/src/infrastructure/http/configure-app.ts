import type { INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import type { AppConfig } from '../config/environment';
import { AdminOriginGuard } from './admin-origin.guard';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { requestIdMiddleware } from './request-id';
import { createValidationPipe } from './request-validation';

interface ExpressSettings {
  set(setting: string, value: unknown): void;
}

/**
 * HTTP setup shared by main.ts and the e2e tests, so tests exercise exactly what runs.
 * CORS stays off unless an allowlist is configured: behind the proxy the apps and the API
 * share the site, and a wildcard origin is never allowed.
 */
export function configureApp(app: INestApplication, config: AppConfig): void {
  // Only the configured number of proxies is trusted for the client IP (login limits).
  (app.getHttpAdapter().getInstance() as ExpressSettings).set(
    'trust proxy',
    config.trustProxyHops,
  );
  app.use(requestIdMiddleware);
  app.use(helmet());
  // Admin responses carry private data: no browser or proxy may store them.
  app.use(
    '/admin',
    (
      _request: unknown,
      response: { setHeader(name: string, value: string): void },
      next: () => void,
    ) => {
      response.setHeader('Cache-Control', 'no-store');
      next();
    },
  );
  if (config.corsAllowedOrigins.length > 0) {
    app.enableCors({ origin: config.corsAllowedOrigins, credentials: true });
  }
  app.useGlobalGuards(new AdminOriginGuard(config));
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
}
