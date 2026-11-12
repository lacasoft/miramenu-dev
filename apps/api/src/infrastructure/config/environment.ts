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

/** A Twilio sender: a number in E.164 or a Messaging Service (MG…). */
const twilioSender = z.string().regex(/^(\+[1-9]\d{6,14}|MG[0-9a-fA-F]{32})$/);

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
    S3_ORIGINALS_BUCKET: s3BucketName,
    S3_ACCESS_KEY_ID: nonEmpty,
    S3_SECRET_ACCESS_KEY: secret,
    S3_FORCE_PATH_STYLE: flag.default(false),
    MEDIA_PUBLIC_BASE_URL: httpUrl,
    MEDIA_UPLOAD_URL_TTL_SECONDS: positiveInt.min(60).max(3600).default(600),
    MEDIA_STALLED_MINUTES: positiveInt.max(24 * 60).default(10),
    MEDIA_WORKER_CONCURRENCY: positiveInt.max(16).default(1),
    FFMPEG_PATH: nonEmpty.default('ffmpeg'),
    FFPROBE_PATH: nonEmpty.default('ffprobe'),
    QUEUE_PREFIX: z
      .string()
      .regex(/^[a-z0-9_-]{1,32}$/)
      .default('miramenu'),
    SMTP_HOST: nonEmpty,
    SMTP_PORT: port,
    SMTP_SECURE: flag.default(false),
    SMTP_USER: nonEmpty.optional(),
    SMTP_PASSWORD: secret.optional(),
    SMTP_FROM: nonEmpty.regex(/@/),
    // ADR-0039: one channel for every business, sent through Twilio.
    VERIFICATION_CHANNEL: z.enum(['whatsapp', 'sms']),
    // Design: the provider gets 5 s; without an answer the send is unconfirmed, never repeated.
    VERIFICATION_PROVIDER_TIMEOUT_MS: positiveInt.max(30_000).default(5000),
    TWILIO_API_BASE_URL: httpUrl.default('https://api.twilio.com'),
    TWILIO_ACCOUNT_SID: z.string().regex(/^AC[0-9a-fA-F]{32}$/),
    TWILIO_AUTH_TOKEN: secret,
    TWILIO_FROM: twilioSender,
    // The message text lives in this Content template, with the code as variable 1.
    TWILIO_CONTENT_SID: z.string().regex(/^HX[0-9a-fA-F]{32}$/),
    // The public URL Twilio posts delivery reports to; signatures are checked against it.
    TWILIO_STATUS_CALLBACK_URL: httpUrl,
    // Key of the HMAC that Redis keeps instead of each code and each phone number.
    DINER_CODE_SECRET: secret,
    // The current privacy notice; a diner shown another version is asked to see this one.
    PRIVACY_NOTICE_VERSION: z.string().trim().min(1).max(40),
    // Where diners read that notice; the PWA links to it from the registration form.
    PRIVACY_NOTICE_URL: httpUrl,
    VERIFICATION_CODE_TTL_SECONDS: positiveInt.max(3600).default(600),
    VERIFICATION_CODE_MAX_ATTEMPTS: positiveInt.max(20).default(5),
    VERIFICATION_RESEND_SECONDS: positiveInt.max(3600).default(60),
    VERIFICATION_SENDS_PER_PHONE_PER_DAY: positiveInt.max(100).default(5),
    VERIFICATION_SENDS_PER_DEVICE_PER_DAY: positiveInt.max(100).default(10),
    VERIFICATION_SENDS_PER_IP_PER_HOUR: positiveInt.max(10_000).default(30),
    DINER_SESSION_DAYS: positiveInt.max(400).default(90),
    // ADR-0040: comments a registered diner may post or edit per hour.
    COMMENTS_PER_DINER_PER_HOUR: positiveInt.max(100).default(5),
    // Design: a comment waiting longer than this is flagged to its moderators.
    COMMENT_OVERDUE_HOURS: positiveInt.max(24 * 30).default(24),
    // How often the worker moves the likes of newly registered devices to their accounts.
    LIKE_TRANSFER_INTERVAL_SECONDS: positiveInt.max(3600).default(5),
    // ADR-0012: past this many waiting batches, new ones are refused and the PWA keeps them.
    MEASUREMENT_QUEUE_MAX_BATCHES: positiveInt.max(10_000_000).default(50_000),
    MEASUREMENT_WORKER_CONCURRENCY: positiveInt.max(32).default(2),
  })
  .superRefine((env, context) => {
    // Originals keep their EXIF (e.g. GPS) and must never be in the public bucket (ADR-0038).
    if (env.S3_ORIGINALS_BUCKET === env.S3_BUCKET) {
      context.addIssue({
        code: 'custom',
        path: ['S3_ORIGINALS_BUCKET'],
        message: 'must differ from S3_BUCKET',
      });
    }
    if (new URL(env.TWILIO_STATUS_CALLBACK_URL).search !== '') {
      context.addIssue({
        code: 'custom',
        path: ['TWILIO_STATUS_CALLBACK_URL'],
        message: 'must not carry a query string',
      });
    }
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
    /** Public: optimized variants, read anonymously. */
    bucket: string;
    /** Private: the uploaded originals, read only by the API and the worker. */
    originalsBucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    forcePathStyle: boolean;
    publicBaseUrl: string;
  };
  media: {
    uploadUrlTtlSeconds: number;
    stalledMinutes: number;
    workerConcurrency: number;
    ffmpegPath: string;
    ffprobePath: string;
  };
  queue: { prefix: string };
  verification: {
    channel: 'whatsapp' | 'sms';
    providerTimeoutMs: number;
    twilio: {
      apiBaseUrl: string;
      accountSid: string;
      authToken: string;
      from: string;
      contentSid: string;
      statusCallbackUrl: string;
    };
  };
  dinerRegistration: {
    codeSecret: string;
    privacyNoticeVersion: string;
    privacyNoticeUrl: string;
    codeTtlSeconds: number;
    codeMaxAttempts: number;
    resendSeconds: number;
    sendsPerPhonePerDay: number;
    sendsPerDevicePerDay: number;
    sendsPerIpPerHour: number;
  };
  dinerSession: { days: number };
  measurement: { queueMaxBatches: number; workerConcurrency: number };
  interactions: {
    commentsPerDinerPerHour: number;
    commentOverdueHours: number;
    likeTransferIntervalSeconds: number;
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
      originalsBucket: parsed.S3_ORIGINALS_BUCKET,
      accessKeyId: parsed.S3_ACCESS_KEY_ID,
      secretAccessKey: parsed.S3_SECRET_ACCESS_KEY,
      forcePathStyle: parsed.S3_FORCE_PATH_STYLE,
      publicBaseUrl: parsed.MEDIA_PUBLIC_BASE_URL.replace(/\/+$/, ''),
    },
    media: {
      uploadUrlTtlSeconds: parsed.MEDIA_UPLOAD_URL_TTL_SECONDS,
      stalledMinutes: parsed.MEDIA_STALLED_MINUTES,
      workerConcurrency: parsed.MEDIA_WORKER_CONCURRENCY,
      ffmpegPath: parsed.FFMPEG_PATH,
      ffprobePath: parsed.FFPROBE_PATH,
    },
    queue: { prefix: parsed.QUEUE_PREFIX },
    verification: {
      channel: parsed.VERIFICATION_CHANNEL,
      providerTimeoutMs: parsed.VERIFICATION_PROVIDER_TIMEOUT_MS,
      twilio: {
        apiBaseUrl: parsed.TWILIO_API_BASE_URL.replace(/\/+$/, ''),
        accountSid: parsed.TWILIO_ACCOUNT_SID,
        authToken: parsed.TWILIO_AUTH_TOKEN,
        from: parsed.TWILIO_FROM,
        contentSid: parsed.TWILIO_CONTENT_SID,
        statusCallbackUrl: parsed.TWILIO_STATUS_CALLBACK_URL,
      },
    },
    dinerRegistration: {
      codeSecret: parsed.DINER_CODE_SECRET,
      privacyNoticeVersion: parsed.PRIVACY_NOTICE_VERSION,
      privacyNoticeUrl: parsed.PRIVACY_NOTICE_URL,
      codeTtlSeconds: parsed.VERIFICATION_CODE_TTL_SECONDS,
      codeMaxAttempts: parsed.VERIFICATION_CODE_MAX_ATTEMPTS,
      resendSeconds: parsed.VERIFICATION_RESEND_SECONDS,
      sendsPerPhonePerDay: parsed.VERIFICATION_SENDS_PER_PHONE_PER_DAY,
      sendsPerDevicePerDay: parsed.VERIFICATION_SENDS_PER_DEVICE_PER_DAY,
      sendsPerIpPerHour: parsed.VERIFICATION_SENDS_PER_IP_PER_HOUR,
    },
    dinerSession: { days: parsed.DINER_SESSION_DAYS },
    measurement: {
      queueMaxBatches: parsed.MEASUREMENT_QUEUE_MAX_BATCHES,
      workerConcurrency: parsed.MEASUREMENT_WORKER_CONCURRENCY,
    },
    interactions: {
      commentsPerDinerPerHour: parsed.COMMENTS_PER_DINER_PER_HOUR,
      commentOverdueHours: parsed.COMMENT_OVERDUE_HOURS,
      likeTransferIntervalSeconds: parsed.LIKE_TRANSFER_INTERVAL_SECONDS,
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
