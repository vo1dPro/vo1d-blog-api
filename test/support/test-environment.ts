import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { config } from 'dotenv';

/** Destructive test setup is allowed only for an explicitly named PostgreSQL test database. */
export function configureTestEnvironment(): string {
  config({ quiet: true });
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('TEST_DATABASE_URL is required; tests never fall back to DATABASE_URL');
  }
  const parsed = new URL(databaseUrl);
  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  if (
    !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
    !/(?:^|[_-])test(?:[_-]|$)/i.test(databaseName)
  ) {
    throw new Error(
      'TEST_DATABASE_URL must name a PostgreSQL database with a separate "test" name component',
    );
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run destructive end-to-end fixtures in NODE_ENV=production');
  }
  process.env.NODE_ENV = 'test';
  process.env.STEAM_SYNC_ENABLED = 'false';
  process.env.STEAM_API_KEY = '';
  process.env.STEAM_ACCOUNTS = '';
  process.env.STEAM_ID = '';
  process.env.DATABASE_URL = databaseUrl;
  process.env.FRONTEND_ORIGINS = 'http://localhost:5173,https://admin.example.com';
  process.env.IP_HASH_SECRET = randomBytes(32).toString('hex');
  process.env.LOGIN_RATE_LIMIT_MAX = '6';
  process.env.LOGIN_RATE_LIMIT_WINDOW_SECONDS = '60';
  process.env.LOGIN_RATE_LIMIT_BLOCK_SECONDS = '120';
  process.env.MEDIA_MAX_UPLOAD_BYTES = String(1024 * 1024);
  process.env.BODY_LIMIT = '1mb';
  return databaseUrl;
}

export async function deployTestMigrations(): Promise<void> {
  await promisify(execFile)(
    process.execPath,
    [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
    {
      cwd: process.cwd(),
      env: { ...process.env },
      timeout: 60_000,
    },
  );
}
