import { describe, expect, it } from 'vitest';
import type { SteamGame } from '../generated/prisma/client.js';
import { aggregateSteamGames } from './steam-aggregate.js';
import { parseSteamAccounts } from './steam-accounts.js';

const now = new Date('2026-09-06T00:00:00Z');
const accounts = ['1', '2', '3'].map((steamId) => ({
  steamId,
  name: `account ${steamId}`,
  libraryVisible: true,
  syncing: false,
  gameCount: 1,
  lastSuccessAt: now.toISOString(),
  nextSyncAt: null,
  lastErrorCode: null,
}));
function game(steamId: string, minutes: number): SteamGame {
  return {
    id: Number(steamId),
    steamId,
    appId: 1172470,
    name: 'Apex Legends',
    playtimeMinutes: minutes,
    playtimeTwoWeeksMinutes: 0,
    lastPlayedAt: now,
    isOwned: true,
    syncedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}
describe('multi-account Steam aggregation', () => {
  it('sums 1200 and 200 hours and deduplicates account/app pairs', () => {
    const first = game('1', 72000);
    const total = aggregateSteamGames(
      [first, first, game('2', 12000)],
      accounts,
      60000,
      now.getTime(),
    ).get(1172470);
    expect(total?.playtimeMinutes).toBe(84000);
    expect(Math.floor((total?.playtimeMinutes ?? 0) / 60)).toBe(1400);
    expect(total?.accountBreakdown).toHaveLength(2);
  });
  it('rounds after summation and keeps unknown recent minutes unknown', () => {
    const second = { ...game('2', 31), playtimeTwoWeeksMinutes: null };
    const total = aggregateSteamGames([game('1', 31), second], accounts, 60000, now.getTime()).get(
      1172470,
    );
    expect(total?.playtimeMinutes).toBe(62);
    expect(total?.playtimeTwoWeeksMinutes).toBeNull();
  });
  it('excludes private, removed and unconfigured accounts and labels incomplete totals', () => {
    const states = accounts.map((account) => ({
      ...account,
      libraryVisible: account.steamId !== '2',
    }));
    const total = aggregateSteamGames(
      [game('1', 72), game('2', 1000), game('4', 999), { ...game('3', 500), isOwned: false }],
      states,
      60000,
      now.getTime(),
    ).get(1172470);
    expect(total).toMatchObject({
      playtimeMinutes: 72,
      incomplete: true,
      stale: true,
      playtimeTwoWeeksMinutes: null,
    });
  });
  it('keeps stale snapshots contributing while marking their account', () => {
    const states = accounts.map((account) => ({
      ...account,
      lastErrorCode: account.steamId === '2' ? 'NETWORK' : null,
    }));
    const total = aggregateSteamGames(
      [game('1', 10), game('2', 20)],
      states,
      60000,
      now.getTime(),
    ).get(1172470);
    expect(total).toMatchObject({ playtimeMinutes: 30, stale: true, incomplete: false });
    expect(total?.accountBreakdown[1]?.stale).toBe(true);
  });
  it('rejects duplicate configuration without exposing credentials', () => {
    const account = { name: 'test', steamId: '76561198000000000', apiKey: 'a'.repeat(32) };
    expect(() => parseSteamAccounts(JSON.stringify([account, account]))).toThrow('unique accounts');
    expect(() => parseSteamAccounts('secret invalid text')).toThrow('Invalid STEAM_ACCOUNTS');
    expect(parseSteamAccounts(JSON.stringify([account]))).toEqual([account]);
  });
  it.each(['PRIVATE_LIBRARY', 'UNAUTHORIZED'])(
    'keeps linked game hours on %s without inventing a first snapshot',
    (code) => {
      const states = accounts.map((account) => ({
        ...account,
        libraryVisible: false,
        lastErrorCode: code,
        lastSuccessAt: account.steamId === '3' ? null : account.lastSuccessAt,
      }));
      const rows = [game('1', 31), game('2', 31), game('3', 999), game('4', 999)];
      const total = aggregateSteamGames(rows, states, 60000, now.getTime(), true).get(1172470);
      expect(total).toMatchObject({
        playtimeMinutes: 62,
        stale: true,
        incomplete: true,
        playtimeTwoWeeksMinutes: null,
      });
      expect(Math.floor((total?.playtimeMinutes ?? 0) / 60)).toBe(1);
      expect(total?.accountBreakdown).toHaveLength(2);
      // An inaccessible library still cannot be used to create new Steam links.
      expect(aggregateSteamGames(rows, states, 60000, now.getTime()).size).toBe(0);
    },
  );
});
