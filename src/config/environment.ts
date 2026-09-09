import { z } from 'zod';
import { parseSteamAccounts } from '../steam/steam-accounts.js';

const booleanFromString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const environmentSchema = z.object({
  STEAM_ACCOUNTS: z.string().default(''),
  STEAM_API_KEY: z
    .string()
    .regex(/^(?:[A-Fa-f0-9]{32})?$/)
    .default(''),
  STEAM_ID: z
    .string()
    .regex(/^(?:\d{17})?$/)
    .default(''),
  STEAM_SYNC_ENABLED: booleanFromString,
  STEAM_SYNC_INTERVAL_SECONDS: z.coerce.number().int().min(60).max(86400).default(300),
  STEAM_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(15000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL: z.string().min(1),
  FRONTEND_ORIGINS: z.string().min(1),
  TRUST_PROXY: booleanFromString,
  BODY_LIMIT: z
    .string()
    .regex(/^\d+(?:kb|mb)$/i)
    .default('1mb'),
  SESSION_COOKIE_NAME: z
    .string()
    .regex(/^[A-Za-z0-9_-]+$/)
    .default('vo1d_admin_session'),
  SESSION_TTL_HOURS: z.coerce
    .number()
    .int()
    .min(1)
    .max(24 * 30)
    .default(24),
  SESSION_TOUCH_INTERVAL_MINUTES: z.coerce.number().int().min(1).max(60).default(5),
  IP_HASH_SECRET: z.string().min(32),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(100).default(5),
  LOGIN_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).default(60),
  LOGIN_RATE_LIMIT_BLOCK_SECONDS: z.coerce.number().int().min(1).default(300),
  MEDIA_PUBLIC_BASE_URL: z.string().url(),
  API_PUBLIC_BASE_URL: z.string().url().default('http://localhost:3100'),
  MEDIA_MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .min(1)
    .max(100 * 1024 * 1024)
    .default(10 * 1024 * 1024),
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1).default('auto'),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: booleanFromString,
});

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(input: Record<string, unknown>): Environment {
  const parsed = environmentSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${z.prettifyError(parsed.error)}`);
  }

  const origins = parsed.data.FRONTEND_ORIGINS.split(',').map((origin) => origin.trim());
  const accounts = parseSteamAccounts(parsed.data.STEAM_ACCOUNTS);
  if (
    parsed.data.STEAM_SYNC_ENABLED &&
    !accounts.length &&
    (!parsed.data.STEAM_API_KEY || !parsed.data.STEAM_ID)
  ) {
    throw new Error('Steam synchronization requires STEAM_API_KEY and STEAM_ID');
  }
  for (const origin of origins) {
    const url = new URL(origin);
    if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol)) {
      throw new Error(`FRONTEND_ORIGINS contains a non-origin value: ${origin}`);
    }
    if (parsed.data.NODE_ENV === 'production' && url.protocol !== 'https:')
      throw new Error('Production FRONTEND_ORIGINS must use HTTPS');
  }

  const database = new URL(parsed.data.DATABASE_URL);
  if (!['postgresql:', 'postgres:'].includes(database.protocol))
    throw new Error('DATABASE_URL must use PostgreSQL');
  if (parsed.data.NODE_ENV === 'production' && !input.API_PUBLIC_BASE_URL) {
    throw new Error('Production API_PUBLIC_BASE_URL is required for database image URLs');
  }
  for (const key of ['S3_ENDPOINT', 'MEDIA_PUBLIC_BASE_URL', 'API_PUBLIC_BASE_URL'] as const) {
    const address = new URL(parsed.data[key]);
    if (
      !['http:', 'https:'].includes(address.protocol) ||
      address.username ||
      address.password ||
      address.search ||
      address.hash
    ) {
      throw new Error(`${key} must be a HTTP(S) URL without credentials, query or fragment`);
    }
  }

  return parsed.data;
}
