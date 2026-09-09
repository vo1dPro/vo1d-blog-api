import { parseSteamAccounts, type SteamAccount } from '../steam/steam-accounts.js';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from './environment.js';

@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<Environment, true>) {}

  get nodeEnv(): Environment['NODE_ENV'] {
    return this.config.get('NODE_ENV', { infer: true });
  }

  get steam(): {
    accounts: SteamAccount[];
    apiKey: string;
    steamId: string;
    enabled: boolean;
    intervalMs: number;
    timeoutMs: number;
  } {
    const accounts = parseSteamAccounts(this.config.get('STEAM_ACCOUNTS', { infer: true }) ?? '');
    const steamId = this.config.get('STEAM_ID', { infer: true });
    const apiKey = this.config.get('STEAM_API_KEY', { infer: true });
    return {
      accounts: accounts.length
        ? accounts
        : steamId && apiKey
          ? [{ name: 'vo1d', steamId, apiKey }]
          : [],
      apiKey: this.config.get('STEAM_API_KEY', { infer: true }),
      steamId: this.config.get('STEAM_ID', { infer: true }),
      enabled: this.config.get('STEAM_SYNC_ENABLED', { infer: true }),
      intervalMs: this.config.get('STEAM_SYNC_INTERVAL_SECONDS', { infer: true }) * 1000,
      timeoutMs: this.config.get('STEAM_REQUEST_TIMEOUT_MS', { infer: true }),
    };
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get port(): number {
    return this.config.get('PORT', { infer: true });
  }

  get databaseUrl(): string {
    return this.config.get('DATABASE_URL', { infer: true });
  }

  get frontendOrigins(): readonly string[] {
    return this.config
      .get('FRONTEND_ORIGINS', { infer: true })
      .split(',')
      .map((origin) => origin.trim());
  }

  get trustProxy(): boolean {
    return this.config.get('TRUST_PROXY', { infer: true });
  }

  get bodyLimit(): string {
    return this.config.get('BODY_LIMIT', { infer: true });
  }

  get sessionCookieName(): string {
    return this.config.get('SESSION_COOKIE_NAME', { infer: true });
  }

  get sessionTtlMs(): number {
    return this.config.get('SESSION_TTL_HOURS', { infer: true }) * 60 * 60 * 1000;
  }

  get sessionTouchIntervalMs(): number {
    return this.config.get('SESSION_TOUCH_INTERVAL_MINUTES', { infer: true }) * 60 * 1000;
  }

  get ipHashSecret(): string {
    return this.config.get('IP_HASH_SECRET', { infer: true });
  }

  get loginRateLimit(): { max: number; windowMs: number; blockMs: number } {
    return {
      max: this.config.get('LOGIN_RATE_LIMIT_MAX', { infer: true }),
      windowMs: this.config.get('LOGIN_RATE_LIMIT_WINDOW_SECONDS', { infer: true }) * 1000,
      blockMs: this.config.get('LOGIN_RATE_LIMIT_BLOCK_SECONDS', { infer: true }) * 1000,
    };
  }

  get mediaPublicBaseUrl(): string {
    return this.config.get('MEDIA_PUBLIC_BASE_URL', { infer: true }).replace(/\/+$/, '');
  }

  get apiPublicBaseUrl(): string {
    return this.config.get('API_PUBLIC_BASE_URL', { infer: true }).replace(/\/+$/, '');
  }

  get mediaMaxUploadBytes(): number {
    return this.config.get('MEDIA_MAX_UPLOAD_BYTES', { infer: true });
  }

  get s3(): {
    endpoint: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    forcePathStyle: boolean;
  } {
    return {
      endpoint: this.config.get('S3_ENDPOINT', { infer: true }),
      region: this.config.get('S3_REGION', { infer: true }),
      bucket: this.config.get('S3_BUCKET', { infer: true }),
      accessKeyId: this.config.get('S3_ACCESS_KEY_ID', { infer: true }),
      secretAccessKey: this.config.get('S3_SECRET_ACCESS_KEY', { infer: true }),
      forcePathStyle: this.config.get('S3_FORCE_PATH_STYLE', { infer: true }),
    };
  }
}
