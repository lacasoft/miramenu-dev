import {
  InvalidEnvironmentError,
  parseDatabaseEnvironment,
  parseEnvironment,
} from './environment';

/** Obviously fake values: long enough to pass the length rule, never real secrets. */
const example = (label: string) => `example_${label}_0123456789abcdef`;

const validEnvironment = (): Record<string, string> => ({
  PORT: '3000',
  CORS_ALLOWED_ORIGINS: '',
  PUBLIC_SITE_URL: 'http://miramenu.localhost:5173',
  ADMIN_APP_URL: 'http://admin.miramenu.localhost:5174',
  DB_HOST: '127.0.0.1',
  DB_PORT: '55432',
  DB_NAME: 'miramenu',
  DB_MIGRATOR_USER: 'miramenu_migrator',
  DB_MIGRATOR_PASSWORD: example('migrator'),
  DB_BUSINESS_ACCESS_USER: 'miramenu_business_access',
  DB_BUSINESS_ACCESS_PASSWORD: example('business_access'),
  DB_CATALOG_USER: 'miramenu_catalog',
  DB_CATALOG_PASSWORD: example('catalog'),
  DB_DINERS_USER: 'miramenu_diners',
  DB_DINERS_PASSWORD: example('diners'),
  DB_INTERACTIONS_USER: 'miramenu_interactions',
  DB_INTERACTIONS_PASSWORD: example('interactions'),
  DB_MEASUREMENT_USER: 'miramenu_measurement',
  DB_MEASUREMENT_PASSWORD: example('measurement'),
  REDIS_HOST: '127.0.0.1',
  REDIS_PORT: '56379',
  REDIS_PASSWORD: example('redis'),
  S3_ENDPOINT: 'http://127.0.0.1:58333',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'media',
  S3_ORIGINALS_BUCKET: 'media-originals',
  S3_ACCESS_KEY_ID: 'example_access_key',
  S3_SECRET_ACCESS_KEY: example('s3'),
  S3_FORCE_PATH_STYLE: 'true',
  MEDIA_PUBLIC_BASE_URL: 'http://127.0.0.1:58333/media/',
  SMTP_HOST: '127.0.0.1',
  SMTP_PORT: '51025',
  SMTP_FROM: 'Miramenu <no-reply@miramenu.localhost>',
});

const problemsOf = (env: Record<string, string | undefined>): string[] => {
  try {
    parseEnvironment(env);
  } catch (error) {
    if (error instanceof InvalidEnvironmentError) return [...error.problems];
    throw error;
  }
  throw new Error('expected the environment to be rejected');
};

describe('parseEnvironment', () => {
  it('builds a typed configuration with one database role per context', () => {
    const config = parseEnvironment(validEnvironment());

    expect(config.port).toBe(3000);
    expect(config.database.migrator.user).toBe('miramenu_migrator');
    expect(config.database.contexts.catalog).toEqual({
      user: 'miramenu_catalog',
      password: example('catalog'),
    });
    expect(Object.keys(config.database.contexts)).toEqual([
      'business_access',
      'catalog',
      'diners',
      'interactions',
      'measurement',
    ]);
    expect(config.storage.forcePathStyle).toBe(true);
    expect(config.storage.publicBaseUrl).toBe('http://127.0.0.1:58333/media');
    expect(config.mail.auth).toBeUndefined();
  });

  it('applies the documented defaults for tuning knobs', () => {
    const config = parseEnvironment(validEnvironment());

    expect(config.database.poolMaxPerContext).toBe(5);
    expect(config.redis.cacheTimeoutMs).toBe(100);
    expect(config.healthCheckTimeoutMs).toBe(1000);
    expect(config.trustProxyHops).toBe(0);
    expect(config.adminSession).toEqual({ idleMinutes: 60, absoluteHours: 12 });
    expect(config.resolutionCache).toEqual({
      refreshSeconds: 60,
      ttlHours: 24,
    });
    expect(config.menuCache).toEqual({ refreshSeconds: 60, ttlHours: 24 });
    expect(config.media).toEqual({
      uploadUrlTtlSeconds: 600,
      stalledMinutes: 10,
      workerConcurrency: 1,
      ffmpegPath: 'ffmpeg',
      ffprobePath: 'ffprobe',
    });
    expect(config.queue).toEqual({ prefix: 'miramenu' });
    expect(config.mail.secure).toBe(false);
  });

  it('refuses an originals bucket that is the public bucket (ADR-0038)', () => {
    const env = { ...validEnvironment(), S3_ORIGINALS_BUCKET: 'media' };

    expect(problemsOf(env)).toContain('S3_ORIGINALS_BUCKET is invalid');
  });

  it('names a missing variable and fails', () => {
    const env = validEnvironment();
    delete env.DB_HOST;

    expect(problemsOf(env)).toContain('DB_HOST is missing');
  });

  it('never includes values in the error, so secrets cannot leak into logs', () => {
    const env = validEnvironment();
    env.DB_CATALOG_PASSWORD = 'example_short';
    env.PORT = '70000';

    let message = '';
    try {
      parseEnvironment(env);
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain('DB_CATALOG_PASSWORD is invalid');
    expect(message).toContain('PORT is invalid');
    expect(message).not.toContain('example_short');
    expect(message).not.toContain('70000');
  });

  it('takes the public site and the admin app as bare http(s) origins', () => {
    const env = validEnvironment();
    expect(parseEnvironment(env).publicSiteUrl).toBe(
      'http://miramenu.localhost:5173',
    );

    env.PUBLIC_SITE_URL = 'https://mirame.nu/menu';
    expect(problemsOf(env)).toContain('PUBLIC_SITE_URL is invalid');

    env.PUBLIC_SITE_URL = 'https://mirame.nu';
    env.ADMIN_APP_URL = 'ftp://admin.mirame.nu';
    expect(problemsOf(env)).toContain('ADMIN_APP_URL is invalid');

    delete env.ADMIN_APP_URL;
    expect(problemsOf(env)).toContain('ADMIN_APP_URL is missing');
  });

  it('parses the CORS allowlist and rejects anything that is not a bare origin', () => {
    const env = validEnvironment();
    env.CORS_ALLOWED_ORIGINS = 'https://admin.mirame.nu, https://mirame.nu';
    expect(parseEnvironment(env).corsAllowedOrigins).toEqual([
      'https://admin.mirame.nu',
      'https://mirame.nu',
    ]);

    env.CORS_ALLOWED_ORIGINS = 'https://admin.mirame.nu/path';
    expect(problemsOf(env)).toContain('CORS_ALLOWED_ORIGINS is invalid');

    env.CORS_ALLOWED_ORIGINS = '*';
    expect(problemsOf(env)).toContain('CORS_ALLOWED_ORIGINS is invalid');
  });

  it('rejects role names that are not plain Postgres identifiers', () => {
    const env = validEnvironment();
    env.DB_CATALOG_USER = 'catalog"; DROP SCHEMA catalog; --';

    expect(problemsOf(env)).toContain('DB_CATALOG_USER is invalid');
  });

  it('requires SMTP credentials as a pair', () => {
    const env = validEnvironment();
    env.SMTP_USER = 'example_mailer';

    expect(problemsOf(env)).toContain('SMTP_PASSWORD is missing');

    env.SMTP_PASSWORD = example('smtp');
    expect(parseEnvironment(env).mail.auth).toEqual({
      user: 'example_mailer',
      password: example('smtp'),
    });
  });
});

describe('parseDatabaseEnvironment', () => {
  it('only needs the database variables, for migrations', () => {
    const env = validEnvironment();
    const databaseOnly = Object.fromEntries(
      Object.entries(env).filter(([key]) => key.startsWith('DB_')),
    );

    expect(parseDatabaseEnvironment(databaseOnly).name).toBe('miramenu');
  });
});
