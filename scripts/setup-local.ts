import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const secret = (): string => randomBytes(32).toString('hex');
const databasePassword = secret();
const storagePassword = secret();
const values = {
  NODE_ENV: 'development',
  PORT: '3100',
  POSTGRES_USER: 'vo1d_local',
  POSTGRES_PASSWORD: databasePassword,
  POSTGRES_DB: 'vo1d_blog',
  POSTGRES_TEST_DB: 'vo1d_blog_test',
  POSTGRES_PORT: '5433',
  DATABASE_URL: `postgresql://vo1d_local:${databasePassword}@localhost:5433/vo1d_blog`,
  TEST_DATABASE_URL: `postgresql://vo1d_local:${databasePassword}@localhost:5433/vo1d_blog_test`,
  FRONTEND_ORIGINS: 'http://localhost:5173,http://localhost:5174,http://localhost:3100',
  TRUST_PROXY: 'false',
  BODY_LIMIT: '1mb',
  SESSION_COOKIE_NAME: 'vo1d_admin_session',
  SESSION_TTL_HOURS: '24',
  SESSION_TOUCH_INTERVAL_MINUTES: '5',
  IP_HASH_SECRET: secret(),
  LOGIN_RATE_LIMIT_MAX: '5',
  LOGIN_RATE_LIMIT_WINDOW_SECONDS: '60',
  LOGIN_RATE_LIMIT_BLOCK_SECONDS: '300',
  MEDIA_MAX_UPLOAD_BYTES: '10485760',
  MEDIA_PUBLIC_BASE_URL: 'http://localhost:9000/vo1d-media',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'vo1d-media',
  S3_ACCESS_KEY_ID: 'vo1d_local_storage',
  S3_SECRET_ACCESS_KEY: storagePassword,
  S3_FORCE_PATH_STYLE: 'true',
  MINIO_ROOT_USER: 'vo1d_local_storage',
  MINIO_ROOT_PASSWORD: storagePassword,
  MINIO_PORT: '9000',
  MINIO_CONSOLE_PORT: '9001',
};
try {
  await writeFile(
    '.env',
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') + '\n',
    { flag: 'wx', mode: 0o600 },
  );
  console.info('Created .env with random LOCAL credentials. Existing .env is never overwritten.');
} catch (error: unknown) {
  if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
    console.info('.env already exists; preserved it.');
  } else throw error;
}
