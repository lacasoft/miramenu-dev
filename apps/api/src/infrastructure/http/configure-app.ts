import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import type { AppConfig } from '../config/environment';
import { AdminOriginGuard } from './admin-origin.guard';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { isPublicSiteOrigin } from './public-site-origin.guard';
import { requestIdMiddleware } from './request-id';
import { createValidationPipe } from './request-validation';

interface ExpressSettings {
  set(setting: string, value: unknown): void;
}

/** Preflights are cached this long (s), so a diner's writes do not pay one each time. */
const CORS_MAX_AGE_SECONDS = 600;

/**
 * HTTP setup shared by main.ts and the e2e tests, so tests exercise exactly what runs.
 * CORS admits the public site and each restaurant subdomain, whose PWA calls the API on
 * its own host with the diner's cookie (ADR-0045), plus the configured allowlist. Any
 * other origin gets no CORS headers, and a wildcard origin is never allowed.
 */
export function configureApp(
  app: NestExpressApplication,
  config: AppConfig,
): void {
  // Only the configured number of proxies is trusted for the client IP (login limits).
  (app.getHttpAdapter().getInstance() as ExpressSettings).set(
    'trust proxy',
    config.trustProxyHops,
  );
  app.use(requestIdMiddleware);
  // sendBeacon can only post a CORS-safelisted type to another origin without a
  // preflight, so measurement batches may come as text/plain holding JSON (ADR-0041).
  app.useBodyParser('text', { type: 'text/plain', limit: '64kb' });
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
  const site = new URL(config.publicSiteUrl);
  app.enableCors({
    origin: (
      origin: string | undefined,
      allow: (error: Error | null, allowed: boolean) => void,
    ) =>
      allow(
        null,
        origin !== undefined &&
          (config.corsAllowedOrigins.includes(origin) ||
            isPublicSiteOrigin(site, origin)),
      ),
    credentials: true,
    maxAge: CORS_MAX_AGE_SECONDS,
    // The PWA reads how long to wait after a 429 (ADR-0039: resend after 60 s).
    exposedHeaders: ['Retry-After'],
  });
  app.useGlobalGuards(new AdminOriginGuard(config));
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
}
