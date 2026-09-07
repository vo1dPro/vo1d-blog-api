import { randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppConfigService } from '../config/app-config.service.js';
import type { Environment } from '../config/environment.js';
import { SteamClient, parseLibrary } from './steam.client.js';
import { normalizeSteamTitle } from './steam.service.js';

const owned = {
  response: {
    game_count: 1,
    games: [
      {
        appid: 730,
        name: 'Counter-Strike 2',
        playtime_forever: 125,
        rtime_last_played: 1700000000,
      },
    ],
  },
};
const recent = { response: { total_count: 1, games: [{ appid: 730, playtime_2weeks: 20 }] } };
const settings = {
  enabled: true,
  accounts: [],
  steamId: '76561198000000000',
  apiKey: randomBytes(16).toString('hex'),
  intervalMs: 300000,
  timeoutMs: 1000,
};
function client(): SteamClient {
  const config = new AppConfigService(new ConfigService<Environment, true>());
  vi.spyOn(config, 'steam', 'get').mockReturnValue(settings);
  return new SteamClient(config);
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Steam contract and safe transport', () => {
  it('keeps exact minutes and UTC last-played dates', () => {
    expect(parseLibrary(owned, recent)).toEqual([
      {
        appId: 730,
        name: 'Counter-Strike 2',
        playtimeMinutes: 125,
        playtimeTwoWeeksMinutes: 20,
        lastPlayedAt: new Date(1700000000000),
      },
    ]);
  });
  it('does not fabricate unknown recent playtime or last-played dates', () => {
    const games = parseLibrary(
      { response: { game_count: 1, games: [{ appid: 1, name: 'Game', playtime_forever: 0 }] } },
      { response: {} },
    );
    expect(games[0]).toMatchObject({
      playtimeMinutes: 0,
      playtimeTwoWeeksMinutes: null,
      lastPlayedAt: null,
    });
  });
  it('accepts an explicitly empty public library', () => {
    expect(parseLibrary({ response: { game_count: 0 } }, { response: { total_count: 0 } })).toEqual(
      [],
    );
  });
  it('does not mistake private details for zero owned games', () => {
    expect(() => parseLibrary({ response: {} }, recent)).toThrow('PRIVATE_LIBRARY');
  });
  it.each([
    { response: { game_count: 2, games: owned.response.games } },
    { response: { game_count: 2, games: [...owned.response.games, ...owned.response.games] } },
    { response: { game_count: 1, games: [{ appid: 1, name: 'Game', playtime_forever: -1 }] } },
    { response: { game_count: 1, games: [{ appid: '730', name: 'Game', playtime_forever: 1 }] } },
    { response: { game_count: 1, games: [{ appid: 1, name: 'Game' }] } },
  ])('rejects malformed, partial and duplicate upstream libraries %#', (payload) => {
    expect(() => parseLibrary(payload, recent)).toThrow('INVALID_RESPONSE');
  });
  it('uses only fixed HTTPS Steam endpoints and refuses redirects', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(owned))
      .mockResolvedValueOnce(Response.json(recent));
    vi.stubGlobal('fetch', fetcher);
    expect(await client().getLibrary()).toHaveLength(1);
    for (const [url, options] of fetcher.mock.calls) {
      expect(url).toBeInstanceOf(URL);
      if (!(url instanceof URL)) throw new Error('Expected URL input');
      expect(url.toString()).toContain('https://api.steampowered.com/IPlayerService/');
      expect(options?.redirect).toBe('error');
      expect(options?.signal).toBeInstanceOf(AbortSignal);
    }
  });
  it.each([
    [429, 'RATE_LIMITED'],
    [403, 'UNAUTHORIZED'],
    [502, 'UPSTREAM'],
  ] as const)('sanitizes HTTP %s errors', async (status, code) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('sensitive upstream body', { status })),
    );
    await expect(client().getLibrary()).rejects.toThrow(code);
  });
  it('does not disclose credentials or upstream causes on transport failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(settings.apiKey)));
    await expect(client().getLibrary()).rejects.toThrow('NETWORK');
    await client()
      .getLibrary()
      .catch((error: unknown) => expect(String(error)).not.toContain(settings.apiKey));
  });
  it('rejects oversized responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(new Uint8Array(4 * 1024 * 1024 + 1))),
    );
    await expect(client().getLibrary()).rejects.toThrow('INVALID_RESPONSE');
  });
  it('matches exact normalized names without guessing translations or editions', () => {
    expect(normalizeSteamTitle('  NieRAutomata™  ')).toBe(normalizeSteamTitle('nierautomata'));
    expect(normalizeSteamTitle('Game Deluxe')).not.toBe(normalizeSteamTitle('Game'));
  });
});
