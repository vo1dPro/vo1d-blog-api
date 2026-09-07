import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { validateEnvironment } from './environment.js';

const fixture: Record<string, unknown> = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/config_test',
  FRONTEND_ORIGINS: 'http://localhost:5173,https://admin.example.com',
  IP_HASH_SECRET: randomBytes(32).toString('hex'),
  MEDIA_PUBLIC_BASE_URL: 'https://media.example.com',
  S3_ENDPOINT: 'http://127.0.0.1:9000',
  S3_BUCKET: 'unit-test-bucket',
  S3_ACCESS_KEY_ID: 'unit-test-only',
  S3_SECRET_ACCESS_KEY: randomBytes(32).toString('hex'),
};

describe('environment configuration', () => {
  it('parses safe defaults and explicit booleans', () => {
    const config = validateEnvironment({
      ...fixture,
      TRUST_PROXY: 'false',
      S3_FORCE_PATH_STYLE: 'true',
    });
    expect(config.PORT).toBe(3000);
    expect(config.MEDIA_MAX_UPLOAD_BYTES).toBe(10 * 1024 * 1024);
    expect(config.TRUST_PROXY).toBe(false);
    expect(config.S3_FORCE_PATH_STYLE).toBe(true);
  });

  it.each([
    '*',
    'https://admin.example.com/path',
    'https://admin.example.com/',
    'null',
    'ftp://admin.example.com',
  ])('rejects non-exact frontend origins: %s', (origin) => {
    expect(() => validateEnvironment({ ...fixture, FRONTEND_ORIGINS: origin })).toThrow();
  });

  it.each([
    { IP_HASH_SECRET: 'short' },
    { SESSION_TTL_HOURS: '0' },
    { PORT: '70000' },
    { MEDIA_MAX_UPLOAD_BYTES: '-1' },
    { BODY_LIMIT: 'unlimited' },
    { S3_SECRET_ACCESS_KEY: '' },
  ])('fails startup on unsafe or missing configuration %j', (invalid) => {
    expect(() => validateEnvironment({ ...fixture, ...invalid })).toThrow();
  });
});
