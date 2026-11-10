import { z } from 'zod';
import type { DatabaseContext } from '../database/database-contexts';

type Environment = Readonly<Record<string, string | undefined>>;

const port = z.coerce.number().int().min(1).max(65535);
const positiveInt = z.coerce.number().int().positive();
const nonEmpty = z.string().trim().min(1);
const secret = z.string().min(16);
const postgresIdentifier = z.string().regex(/^[a-z_][a-z0-9_]{0,62}$/);
const flag = z.enum(['true', 'false']).transform((value) => value === 'true');
const httpUrl = z.url({ protocol: /^https?$/ });
const s3BucketName = z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/);

const isBareOrigin = (value: string): boolean => {
  try {
    return new URL(value).origin === value;
  } catch {
    return false;
  }
};

const originList = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  )
  .pipe(z.array(z.string().refine(isBareOrigin)));

/** An http(s) origin with no path, such as https://mirame.nu or http://miramenu.localhost:5173. */
const bareOrigin = httpUrl.refine(isBareOrigin);

const databaseShape = {
  DB_HOST: nonEmpty,
  DB_PORT: port,
  DB_NAME: postgresIdentifier,
  DB_POOL_MAX_PER_CONTEXT: positiveInt.max(50).default(5),
  DB_MIGRATOR_USER: postgresIdentifier,
  DB_MIGRATOR_PASSWORD: secret,
  DB_BUSINESS_ACCESS_USER: postgresIdentifier,
  DB_BUSINESS_ACCESS_PASSWORD: secret,
  DB_CATALOG_USER: postgresIdentifier,
  DB_CATALOG_PASSWORD: secret,
  DB_DINERS_USER: postgresIdentifier,
  DB_DINERS_PASSWORD: secret,
  DB_INTERACTIONS_USER: postgresIdentifier,
  DB_INTERACTIONS_PASSWORD: secret,
  DB_MEASUREMENT_USER: postgresIdentifier,
  DB_MEASUREMENT_PASSWORD: secret,
};

const environmentSchema = z
  .object({
    PORT: port,
    CORS_ALLOWED_ORIGINS: originList,
    HEALTH_CHECK_TIMEOUT_MS: positiveInt.max(30_000).default(1000),
    // How many proxies sit in front of the API, so request.ip is the client's (login limits).
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
    // Base of branch URLs and QR short links, e.g. https://mirame.nu (ADR-0010, ADR-0029).
    PUBLIC_SITE_URL: bareOrigin,
    // The admin app: the only Origin accepted on admin writes and the base of invitation links.
    ADMIN_APP_URL: bareOrigin,
    ADMIN_SESSION_IDLE_MINUTES: positiveInt.max(24 * 60).default(60),
    ADMIN_SESSION_ABSOLUTE_HOURS: positiveInt.max(24 * 30).default(12),
    // ADR-0016: refresh the cached QR and site resolution after 60 s, keep it 24 h.
    RESOLUTION_CACHE_REFRESH_SECONDS: positiveInt.max(3600).default(60),
    RESOLUTION_CACHE_TTL_HOURS: positiveInt.max(24 * 7).default(24),
    MENU_CACHE_REFRESH_SECONDS: positiveInt.max(3600).default(60),
    MENU_CACHE_TTL_HOURS: positiveInt.max(24 * 7).default(24),
    ...databaseShape,
    REDIS_HOST: nonEmpty,
    REDIS_PORT: port,
    REDIS_PASSWORD: secret,
    // ADR-0017: the cache client gives up fast so a slow Redis never delays the menu.
    REDIS_CACHE_TIMEOUT_MS: positiveInt.max(5000).default(100),
    S3_ENDPOINT: httpUrl,
    S3_REGION: nonEmpty,
    S3_BUCKET: s3BucketName,
    S3_ACCESS_KEY_ID: nonEmpty,
    S3_SECRET_ACCESS_KEY: secret,
    S3_FORCE_PATH_STYLE: flag.default(false),
    MEDIA_PUBLIC_BASE_URL: httpUrl,
    SMTP_HOST: nonEmpty,
    SMTP_PORT: port,
    SMTP_SECURE: flag.default(false),
    SMTP_USER: nonEmpty.optional(),
    SMTP_PASSWORD: secret.optional(),
    SMTP_FROM: nonEmpty.regex(/@/),
  })
  .superRefine((env, context) => {
    if (env.SMTP_USER !== undefined && env.SMTP_PASSWORD === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['SMTP_PASSWORD'],
        message: 'required with SMTP_USER',
      });
    }
    if (env.SMTP_PASSWORD !== undefined && env.SMTP_USER === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['SMTP_USER'],
        message: 'required with SMTP_PASSWORD',
      });
    }
  });

const databaseSchema = z.object(databaseShape);

export interface Credentials {
  user: string;
  password: string;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  name: string;
  poolMaxPerContext: number;
  migrator: Credentials;
  contexts: Record<DatabaseContext, Credentials>;
}

export interface AppConfig {
  port: number;
  corsAllowedOrigins: string[];
  healthCheckTimeoutMs: number;
  trustProxyHops: number;
  publicSiteUrl: string;
  adminAppUrl: string;
  adminSession: { idleMinutes: number; absoluteHours: number };
  resolutionCache: { refreshSeconds: number; ttlHours: number };
  menuCache: { refreshSeconds: number; ttlHours: number };
  database: DatabaseConfig;
  redis: {
    host: string;
    port: number;
    password: string;
    cacheTimeoutMs: number;
  };
  storage: {
    endpoint: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    forcePathStyle: boolean;
    publicBaseUrl: string;
  };
  mail: {
    host: string;
    port: number;
    secure: boolean;
    from: string;
    auth?: Credentials;
  };
}

/**
 * Thrown when the environment is incomplete or invalid. It names the variables and
 * never their values, so it is safe to log.
 */
export class InvalidEnvironmentError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Invalid environment: ${problems.join('; ')}`);
    this.name = 'InvalidEnvironmentError';
  }
}

function describeProblems(
  issues: readonly z.core.$ZodIssue[],
  env: Environment,
): string[] {
  const problems = issues.map((issue) => {
    const key = String(issue.path[0] ?? 'environment');
    const value = env[key];
    return value === undefined || value === ''
      ? `${key} is missing`
      : `${key} is invalid`;
  });
  return [...new Set(problems)];
}

function parseWith<T extends z.ZodType>(
  schema: T,
  env: Environment,
): z.output<T> {
  const result = schema.safeParse(env);
  if (!result.success) {
    throw new InvalidEnvironmentError(
      describeProblems(result.error.issues, env),
    );
  }
  return result.data;
}

function toDatabaseConfig(
  env: z.output<typeof databaseSchema>,
): DatabaseConfig {
  return {
    host: env.DB_HOST,
    port: env.DB_PORT,
    name: env.DB_NAME,
    poolMaxPerContext: env.DB_POOL_MAX_PER_CONTEXT,
    migrator: {
      user: env.DB_MIGRATOR_USER,
      password: env.DB_MIGRATOR_PASSWORD,
    },
    contexts: {
      business_access: {
        user: env.DB_BUSINESS_ACCESS_USER,
        password: env.DB_BUSINESS_ACCESS_PASSWORD,
      },
      catalog: { user: env.DB_CATALOG_USER, password: env.DB_CATALOG_PASSWORD },
      diners: { user: env.DB_DINERS_USER, password: env.DB_DINERS_PASSWORD },
      interactions: {
        user: env.DB_INTERACTIONS_USER,
        password: env.DB_INTERACTIONS_PASSWORD,
      },
      measurement: {
        user: env.DB_MEASUREMENT_USER,
        password: env.DB_MEASUREMENT_PASSWORD,
      },
    },
  };
}

/** Database settings only, for the migration CLI and the isolation tests. */
export function parseDatabaseEnvironment(env: Environment): DatabaseConfig {
  return toDatabaseConfig(parseWith(databaseSchema, env));
}

/** The whole configuration of the API, validated once at boot (fail fast). */
export function parseEnvironment(env: Environment): AppConfig {
  const parsed = parseWith(environmentSchema, env);
  return {
    port: parsed.PORT,
    corsAllowedOrigins: parsed.CORS_ALLOWED_ORIGINS,
    healthCheckTimeoutMs: parsed.HEALTH_CHECK_TIMEOUT_MS,
    trustProxyHops: parsed.TRUST_PROXY_HOPS,
    publicSiteUrl: parsed.PUBLIC_SITE_URL,
    adminAppUrl: parsed.ADMIN_APP_URL,
    adminSession: {
      idleMinutes: parsed.ADMIN_SESSION_IDLE_MINUTES,
      absoluteHours: parsed.ADMIN_SESSION_ABSOLUTE_HOURS,
    },
    resolutionCache: {
      refreshSeconds: parsed.RESOLUTION_CACHE_REFRESH_SECONDS,
      ttlHours: parsed.RESOLUTION_CACHE_TTL_HOURS,
    },
    menuCache: {
      refreshSeconds: parsed.MENU_CACHE_REFRESH_SECONDS,
      ttlHours: parsed.MENU_CACHE_TTL_HOURS,
    },
    database: toDatabaseConfig(parsed),
    redis: {
      host: parsed.REDIS_HOST,
      port: parsed.REDIS_PORT,
      password: parsed.REDIS_PASSWORD,
      cacheTimeoutMs: parsed.REDIS_CACHE_TIMEOUT_MS,
    },
    storage: {
      endpoint: parsed.S3_ENDPOINT,
      region: parsed.S3_REGION,
      bucket: parsed.S3_BUCKET,
      accessKeyId: parsed.S3_ACCESS_KEY_ID,
      secretAccessKey: parsed.S3_SECRET_ACCESS_KEY,
      forcePathStyle: parsed.S3_FORCE_PATH_STYLE,
      publicBaseUrl: parsed.MEDIA_PUBLIC_BASE_URL.replace(/\/+$/, ''),
    },
    mail: {
      host: parsed.SMTP_HOST,
      port: parsed.SMTP_PORT,
      secure: parsed.SMTP_SECURE,
      from: parsed.SMTP_FROM,
      auth:
        parsed.SMTP_USER !== undefined && parsed.SMTP_PASSWORD !== undefined
          ? { user: parsed.SMTP_USER, password: parsed.SMTP_PASSWORD }
          : undefined,
    },
  };
}
