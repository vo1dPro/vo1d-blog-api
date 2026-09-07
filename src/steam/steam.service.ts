import { randomUUID } from 'node:crypto';
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  type OnApplicationBootstrap,
  type BeforeApplicationShutdown,
  HttpException,
} from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service.js';
import { PrismaService } from '../database/prisma.service.js';
import type { SteamAccount } from './steam-accounts.js';
import { aggregateSteamGames } from './steam-aggregate.js';
import type { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import { SteamClient, SteamUpstreamError } from './steam.client.js';
import type {
  SteamGameDto,
  SteamLibraryPageDto,
  SteamStatusDto,
  SteamLinkResultDto,
} from './steam.dto.js';

export function normalizeSteamTitle(title: string): string {
  return title.replace(/[™®]/gu, '').normalize('NFKC').trim().toLowerCase().replace(/\s+/gu, ' ');
}

@Injectable()
export class SteamService implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(SteamService.name);
  private timer: ReturnType<typeof setInterval> | undefined;
  private background: Promise<void> | undefined;
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly client: SteamClient,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.steam.enabled) return;
    const tick = (): void => {
      if (this.background) return;
      this.background = this.sync(false)
        .then(() => undefined)
        .catch(() => {
          this.logger.warn('Steam automatic sync failed; inspect /admin/steam/status');
        })
        .finally(() => {
          this.background = undefined;
        });
    };
    this.timer = setInterval(tick, 15000);
    this.timer.unref();
    tick();
  }
  async beforeApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.background;
  }

  async status(): Promise<SteamStatusDto> {
    const settings = this.config.steam;
    const states = await this.prisma.steamSyncState.findMany({
      where: { steamId: { in: settings.accounts.map((a) => a.steamId) } },
    });
    const accounts = settings.accounts.map((account) => {
      const state = states.find((item) => item.steamId === account.steamId);
      return {
        name: account.name,
        steamId: account.steamId,
        syncing: (state?.leaseUntil?.getTime() ?? 0) > Date.now(),
        libraryVisible: state?.libraryVisible ?? false,
        gameCount: state?.gameCount ?? 0,
        lastSuccessAt: state?.lastSuccessAt?.toISOString() ?? null,
        nextSyncAt: state?.nextSyncAt.toISOString() ?? null,
        lastErrorCode: state?.lastErrorCode ?? null,
      };
    });
    const visibleIds = settings.enabled
      ? accounts.filter((a) => a.libraryVisible).map((a) => a.steamId)
      : [];
    const unique = visibleIds.length
      ? await this.prisma.steamGame.groupBy({
          by: ['appId'],
          where: { steamId: { in: visibleIds }, isOwned: true },
        })
      : [];
    const next = accounts
      .map((a) => a.nextSyncAt)
      .filter((date): date is string => date !== null)
      .sort();
    const successes = accounts
      .map((a) => a.lastSuccessAt)
      .filter((date): date is string => date !== null)
      .sort();
    return {
      enabled: settings.enabled,
      steamId: accounts.length === 1 ? (accounts[0]?.steamId ?? null) : null,
      accounts,
      intervalSeconds: settings.intervalMs / 1000,
      syncing: accounts.some((a) => a.syncing),
      libraryVisible: visibleIds.length > 0,
      gameCount: unique.length,
      lastSuccessAt: successes.length === accounts.length ? (successes[0] ?? null) : null,
      nextSyncAt: next.length === accounts.length ? (next[0] ?? null) : null,
      lastErrorCode: accounts.find((a) => a.lastErrorCode)?.lastErrorCode ?? null,
    };
  }

  async sync(manual = true): Promise<SteamStatusDto> {
    if (!this.config.steam.enabled)
      throw new ServiceUnavailableException('Steam synchronization is disabled');
    const results = await Promise.allSettled(
      this.config.steam.accounts.map((account) => this.syncAccount(account, manual)),
    );
    if (manual && !results.some((result) => result.status === 'fulfilled' && result.value)) {
      const failed =
        results.find(
          (result) =>
            result.status === 'rejected' &&
            (!(result.reason instanceof HttpException) || result.reason.getStatus() !== 429),
        ) ?? results.find((result) => result.status === 'rejected');
      if (failed?.status === 'rejected') throw failed.reason;
    }
    return this.status();
  }

  private async syncAccount(account: SteamAccount, manual: boolean): Promise<boolean> {
    const settings = this.config.steam;
    const steamId = account.steamId;
    const now = new Date();
    const leaseToken = randomUUID();
    // Both cooldown and lease are durable and shared by every API replica.
    await this.prisma.steamSyncState.createMany({
      data: [{ steamId, nextSyncAt: now }],
      skipDuplicates: true,
    });
    const claimed = await this.prisma.steamSyncState.updateMany({
      where: {
        steamId,
        nextSyncAt: { lte: now },
        OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
      },
      data: { leaseToken, leaseUntil: new Date(now.getTime() + 180000), lastAttemptAt: now },
    });
    if (claimed.count === 0) {
      if (manual)
        throw new HttpException('Steam sync is running or cooling down; inspect nextSyncAt', 429);
      return false;
    }
    try {
      const library = await this.client.getLibrary(account);
      const syncedAt = new Date();
      await this.prisma.$transaction(
        async (tx) => {
          // Lock and verify the lease in the same transaction that publishes the snapshot.
          const owner = await tx.steamSyncState.updateMany({
            where: { steamId, leaseToken },
            data: { updatedAt: syncedAt },
          });
          if (owner.count !== 1) throw new Error('Steam lease lost');
          await tx.steamGame.updateMany({ where: { steamId }, data: { isOwned: false } });
          // Sequential queries avoid concurrent commands on a single transaction connection.
          for (const game of library)
            await tx.steamGame.upsert({
              where: { steamId_appId: { steamId, appId: game.appId } },
              create: { ...game, steamId, syncedAt, isOwned: true },
              update: { ...game, syncedAt, isOwned: true },
            });
          await tx.steamSyncState.update({
            where: { steamId },
            data: {
              lastSuccessAt: syncedAt,
              nextSyncAt: new Date(syncedAt.getTime() + settings.intervalMs),
              leaseToken: null,
              leaseUntil: null,
              lastErrorCode: null,
              failureCount: 0,
              libraryVisible: true,
              gameCount: library.length,
            },
          });
        },
        { timeout: 60000 },
      );
      return true;
    } catch (error: unknown) {
      const code = error instanceof SteamUpstreamError ? error.code : 'DATABASE';
      const state = await this.prisma.steamSyncState.findUniqueOrThrow({ where: { steamId } });
      const failures = Math.min(state.failureCount + 1, 20);
      const retryMs = Math.max(
        code === 'UNAUTHORIZED' ? 1800000 : 60000,
        Math.min(3600000, settings.intervalMs * 2 ** Math.min(failures, 5)),
      );
      await this.prisma.steamSyncState.updateMany({
        where: { steamId, leaseToken },
        data: {
          leaseToken: null,
          leaseUntil: null,
          lastErrorCode: code,
          failureCount: failures,
          nextSyncAt: new Date(Date.now() + retryMs),
          ...(['PRIVATE_LIBRARY', 'UNAUTHORIZED'].includes(code) ? { libraryVisible: false } : {}),
        },
      });
      throw new ServiceUnavailableException(
        `Steam sync failed: ${code}; previous snapshot preserved`,
      );
    }
  }

  async library(query: PaginationQueryDto): Promise<SteamLibraryPageDto> {
    const games = await this.aggregate();
    const items = [...games.values()].sort(
      (a, b) => b.playtimeMinutes - a.playtimeMinutes || a.appId - b.appId,
    );
    return {
      items: items.slice((query.page - 1) * query.pageSize, query.page * query.pageSize),
      page: query.page,
      pageSize: query.pageSize,
      total: items.length,
      totalPages: Math.ceil(items.length / query.pageSize),
    };
  }

  async forAppIds(ids: number[]): Promise<Map<number, SteamGameDto>> {
    return ids.length ? this.aggregate(ids) : new Map();
  }

  private async aggregate(ids?: number[]): Promise<Map<number, SteamGameDto>> {
    const settings = this.config.steam;
    if (!settings.enabled) return new Map();
    const status = await this.status();
    const visible = status.accounts.filter((a) => a.libraryVisible);
    const rows = await this.prisma.steamGame.findMany({
      where: {
        steamId: { in: visible.map((a) => a.steamId) },
        isOwned: true,
        ...(ids ? { appId: { in: ids } } : {}),
      },
      orderBy: [{ steamId: 'asc' }, { appId: 'asc' }],
    });
    return aggregateSteamGames(rows, status.accounts, settings.intervalMs);
  }

  async assertApp(appId: number): Promise<void> {
    const rows = await this.forAppIds([appId]);
    if (!rows.has(appId))
      throw new ServiceUnavailableException(
        'Steam app is not in the current visible synced library',
      );
  }

  async linkMatches(): Promise<SteamLinkResultDto> {
    const status = await this.status();
    if (!status.enabled || !status.libraryVisible)
      throw new ServiceUnavailableException('Sync a visible Steam library first');
    return this.prisma.$transaction(async (tx) => {
      const library = await tx.steamGame.findMany({
        where: {
          steamId: { in: status.accounts.filter((a) => a.libraryVisible).map((a) => a.steamId) },
          isOwned: true,
        },
      });
      const games = await tx.game.findMany();
      const linked = new Set(games.flatMap((g) => (g.steamAppId === null ? [] : [g.steamAppId])));
      const linkedGameIds: number[] = [];
      for (const game of games) {
        if (game.steamAppId !== null) continue;
        const key = normalizeSteamTitle(game.title);
        const matches = [
          ...new Map(
            library.filter((s) => normalizeSteamTitle(s.name) === key).map((s) => [s.appId, s]),
          ).values(),
        ];
        if (
          matches.length !== 1 ||
          games.filter((g) => normalizeSteamTitle(g.title) === key).length !== 1
        )
          continue;
        const match = matches[0];
        if (!match || linked.has(match.appId)) continue;
        const result = await tx.game.updateMany({
          where: { id: game.id, steamAppId: null },
          data: { steamAppId: match.appId },
        });
        if (result.count) {
          linkedGameIds.push(game.id);
          linked.add(match.appId);
        }
      }
      return { linkedGameIds };
    });
  }
}
