import type { SteamAccount } from './steam-accounts.js';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AppConfigService } from '../config/app-config.service.js';

const integer = z.number().int().min(0).max(2_147_483_647);
const ownedSchema = z.object({
  response: z.object({
    game_count: integer.max(10000),
    games: z
      .array(
        z.object({
          appid: integer.min(1),
          name: z.string().min(1).max(500),
          playtime_forever: integer,
          rtime_last_played: z.number().int().min(0).max(253402300799).optional(),
        }),
      )
      .max(10000)
      .optional(),
  }),
});
const recentSchema = z.object({
  response: z.object({
    total_count: integer.optional(),
    games: z
      .array(z.object({ appid: integer.min(1), playtime_2weeks: integer }))
      .max(100)
      .optional(),
  }),
});
export type SteamErrorCode =
  'NETWORK' | 'RATE_LIMITED' | 'UNAUTHORIZED' | 'UPSTREAM' | 'INVALID_RESPONSE' | 'PRIVATE_LIBRARY';
export class SteamUpstreamError extends Error {
  constructor(readonly code: SteamErrorCode) {
    super(`Steam synchronization failed: ${code}`);
  }
}
export interface SteamLibraryGame {
  appId: number;
  name: string;
  playtimeMinutes: number;
  playtimeTwoWeeksMinutes: number | null;
  lastPlayedAt: Date | null;
}

export function parseLibrary(owned: unknown, recent: unknown): SteamLibraryGame[] {
  // A missing game_count often means private game details; never interpret it as an empty library.
  const outer = z.object({ response: z.record(z.string(), z.unknown()) }).safeParse(owned);
  if (outer.success && Object.keys(outer.data.response).length === 0)
    throw new SteamUpstreamError('PRIVATE_LIBRARY');
  const library = ownedSchema.safeParse(owned);
  const recentResult = recentSchema.safeParse(recent);
  if (!library.success || !recentResult.success) throw new SteamUpstreamError('INVALID_RESPONSE');
  const games = library.data.response.games ?? [];
  if (
    library.data.response.game_count !== games.length ||
    new Set(games.map((g) => g.appid)).size !== games.length
  )
    throw new SteamUpstreamError('INVALID_RESPONSE');
  const recentGames = new Map(
    (recentResult.data.response.games ?? []).map((g) => [g.appid, g.playtime_2weeks]),
  );
  return games.map((game) => ({
    appId: game.appid,
    name: game.name,
    playtimeMinutes: game.playtime_forever,
    playtimeTwoWeeksMinutes:
      recentGames.get(game.appid) ?? (recentResult.data.response.total_count === 0 ? 0 : null),
    lastPlayedAt: game.rtime_last_played ? new Date(game.rtime_last_played * 1000) : null,
  }));
}

@Injectable()
export class SteamClient {
  constructor(private readonly config: AppConfigService) {}

  async getLibrary(account?: SteamAccount): Promise<SteamLibraryGame[]> {
    const owned = await this.get(
      'GetOwnedGames',
      {
        include_appinfo: 'true',
        include_played_free_games: 'true',
      },
      account,
    );
    const recent = await this.get('GetRecentlyPlayedGames', { count: '100' }, account);
    return parseLibrary(owned, recent);
  }

  private async get(
    method: 'GetOwnedGames' | 'GetRecentlyPlayedGames',
    params: Record<string, string>,
    account?: SteamAccount,
  ): Promise<unknown> {
    const settings = this.config.steam;
    // No caller-controlled host, path, account or redirect; do not expose upstream bodies/URLs in errors.
    const url = new URL(`https://api.steampowered.com/IPlayerService/${method}/v1/`);
    url.search = new URLSearchParams({
      key: account?.apiKey ?? settings.apiKey,
      steamid: account?.steamId ?? settings.steamId,
      format: 'json',
      ...params,
    }).toString();
    try {
      const response = await fetch(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(settings.timeoutMs),
        headers: { Accept: 'application/json', 'User-Agent': 'vo1d-blog-api' },
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new SteamUpstreamError(
          response.status === 429
            ? 'RATE_LIMITED'
            : [401, 403].includes(response.status)
              ? 'UNAUTHORIZED'
              : 'UPSTREAM',
        );
      }
      if (!response.body) throw new SteamUpstreamError('INVALID_RESPONSE');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const result: { done: boolean; value?: unknown } = await reader.read();
          if (result.done) break;
          const value = result.value;
          if (!(value instanceof Uint8Array)) throw new SteamUpstreamError('INVALID_RESPONSE');
          size += value.byteLength;
          if (size > 4 * 1024 * 1024) throw new SteamUpstreamError('INVALID_RESPONSE');
          chunks.push(value);
        }
      } finally {
        await reader.cancel();
        reader.releaseLock();
      }
      try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
      } catch {
        throw new SteamUpstreamError('INVALID_RESPONSE');
      }
    } catch (error: unknown) {
      if (error instanceof SteamUpstreamError) throw error;
      throw new SteamUpstreamError('NETWORK');
    }
  }
}
