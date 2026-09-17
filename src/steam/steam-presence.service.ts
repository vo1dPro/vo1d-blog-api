import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service.js';
import { SteamClient, SteamUpstreamError } from './steam.client.js';

export interface SteamPresence {
  source: 'steam';
  state: 'playing' | 'idle' | 'unavailable' | 'unconfigured';
  appId: number | null;
  updatedAt: string;
  expiresAt: string;
  refreshAfterMs: number;
}

const INTERVAL = 180_000;

@Injectable()
export class SteamPresenceService {
  private cached: SteamPresence | undefined;
  private pending: Promise<SteamPresence> | undefined;

  constructor(
    private readonly config: AppConfigService,
    private readonly client: SteamClient,
  ) {}

  read(): Promise<SteamPresence> {
    if (this.pending) return this.pending;
    if (
      this.cached &&
      Date.now() < Date.parse(this.cached.updatedAt) + this.cached.refreshAfterMs
    ) {
      return Promise.resolve(this.cached);
    }
    this.pending = this.query()
      .then((result) => {
        this.cached = result;
        return result;
      })
      .finally(() => {
        this.pending = undefined;
      });
    return this.pending;
  }

  private async query(): Promise<SteamPresence> {
    const settings = this.config.steam;
    const create = (
      state: SteamPresence['state'],
      appId: number | null = null,
      delay = INTERVAL,
    ): SteamPresence => {
      const now = Date.now();
      return {
        source: 'steam',
        state,
        appId,
        updatedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + delay + (state === 'playing' ? 20_000 : 0)).toISOString(),
        refreshAfterMs: delay,
      };
    };
    if (!settings.enabled || !settings.accounts.length) return create('unconfigured');
    const results = await Promise.allSettled(
      settings.accounts.map((account) => this.client.getPlayingApp(account)),
    );
    const active = results.find((result) => result.status === 'fulfilled' && result.value !== null);
    if (active?.status === 'fulfilled') return create('playing', active.value);
    const failed = results.filter((result) => result.status === 'rejected');
    if (failed.length) {
      const limited = failed.some(
        (result) =>
          result.reason instanceof SteamUpstreamError && result.reason.code === 'RATE_LIMITED',
      );
      return create('unavailable', null, limited ? INTERVAL : 30_000);
    }
    return create('idle');
  }
}
