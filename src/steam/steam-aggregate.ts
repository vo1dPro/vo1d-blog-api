import type { SteamGame } from '../generated/prisma/client.js';
import type { SteamAccountStatusDto, SteamGameDto } from './steam.dto.js';

/** Sum exact minutes before rounding. Never count an account/App ID twice. */
export function aggregateSteamGames(
  rows: readonly SteamGame[],
  accounts: readonly SteamAccountStatusDto[],
  intervalMs: number,
  now = Date.now(),
  preserveFailedSnapshots = false,
): Map<number, SteamGameDto> {
  const result = new Map<number, SteamGameDto>();
  const seen = new Set<string>();
  const incomplete = accounts.some((account) => !account.libraryVisible || !account.lastSuccessAt);
  for (const row of rows) {
    const account = accounts.find((item) => item.steamId === row.steamId);
    const key = `${row.steamId}:${row.appId}`;
    const usable =
      account &&
      (account.libraryVisible ||
        (preserveFailedSnapshots &&
          account.lastSuccessAt !== null &&
          account.lastErrorCode !== null));
    if (!usable || !row.isOwned || seen.has(key)) continue;
    seen.add(key);
    const stale = Boolean(account.lastErrorCode) || now - row.syncedAt.getTime() >= intervalMs;
    const detail = { accountName: account.name, playtimeMinutes: row.playtimeMinutes, stale };
    const existing = result.get(row.appId);
    if (!existing) {
      result.set(row.appId, {
        appId: row.appId,
        name: row.name,
        playtimeMinutes: row.playtimeMinutes,
        playtimeTwoWeeksMinutes: incomplete ? null : row.playtimeTwoWeeksMinutes,
        lastPlayedAt: row.lastPlayedAt?.toISOString() ?? null,
        syncedAt: row.syncedAt.toISOString(),
        stale: stale || incomplete,
        incomplete,
        accountBreakdown: [detail],
        storeUrl: `https://store.steampowered.com/app/${row.appId}/`,
      });
    } else {
      existing.playtimeMinutes += row.playtimeMinutes;
      existing.playtimeTwoWeeksMinutes =
        existing.playtimeTwoWeeksMinutes === null || row.playtimeTwoWeeksMinutes === null
          ? null
          : existing.playtimeTwoWeeksMinutes + row.playtimeTwoWeeksMinutes;
      const last = row.lastPlayedAt?.toISOString();
      if (last && (!existing.lastPlayedAt || last > existing.lastPlayedAt))
        existing.lastPlayedAt = last;
      if (row.syncedAt.toISOString() < existing.syncedAt)
        existing.syncedAt = row.syncedAt.toISOString();
      existing.stale ||= stale;
      existing.accountBreakdown.push(detail);
    }
  }
  return result;
}
