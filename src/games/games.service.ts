import type { PaginationQueryDto, PaginatedResponseDto } from '../common/dto/pagination.dto.js';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { ReorderDto } from '../common/dto/reorder.dto.js';
import { AppConfigService } from '../config/app-config.service.js';
import { PrismaService } from '../database/prisma.service.js';
import type { MediaAsset, Prisma } from '../generated/prisma/client.js';
import { MediaKind } from '../generated/prisma/enums.js';
import type { CreateGameDto } from './dto/create-game.dto.js';
import type { GameMediaResponseDto, GameResponseDto } from './dto/game-response.dto.js';
import type { UpdateGameDto } from './dto/update-game.dto.js';
import { SteamService } from '../steam/steam.service.js';
import type { SteamGameDto } from '../steam/steam.dto.js';
import { SteamPresenceService } from '../steam/steam-presence.service.js';
import type { GamePresenceResponseDto } from './dto/game-presence-response.dto.js';

type GameWithCover = Prisma.GameGetPayload<{ include: { coverMedia: true } }>;

@Injectable()
export class GamesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly steamService: SteamService,
    private readonly steamPresence: SteamPresenceService,
  ) {}

  async playing(): Promise<GamePresenceResponseDto> {
    const presence = await this.steamPresence.read();
    const { appId, ...publicPresence } = presence;
    if (presence.state !== 'playing') {
      return { ...publicPresence, game: null, totalGameHours: 0 };
    }
    // Use the same editorial fields and effective hours as the public player.
    const records = await this.prisma.game.findMany({
      where: { isVisible: true },
      include: { coverMedia: true },
    });
    const games = await this.mapGames(records);
    const game = games.find((item) => item.steamAppId === appId) ?? null;
    return {
      source: 'steam',
      state: game ? 'playing' : 'idle',
      game,
      totalGameHours: games.reduce((total, item) => total + item.playtimeHours, 0),
      updatedAt: presence.updatedAt,
      expiresAt: presence.expiresAt,
      refreshAfterMs: presence.refreshAfterMs,
    };
  }

  async findPublic(query: PaginationQueryDto): Promise<PaginatedResponseDto<GameResponseDto>> {
    const where = { isVisible: true };
    const [records, total] = await this.prisma.$transaction(
      [
        this.prisma.game.findMany({
          where,
          include: { coverMedia: true },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.prisma.game.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      items: await this.mapGames(records),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  async findAllAdmin(query: PaginationQueryDto): Promise<PaginatedResponseDto<GameResponseDto>> {
    const where = {};
    const [records, total] = await this.prisma.$transaction(
      [
        this.prisma.game.findMany({
          where,
          include: { coverMedia: true },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.prisma.game.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      items: await this.mapGames(records),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  async findOneAdmin(id: number): Promise<GameResponseDto> {
    const game = await this.prisma.game.findUnique({
      where: { id },
      include: { coverMedia: true },
    });
    if (game === null) {
      throw new NotFoundException('Game not found');
    }
    return this.mapSingle(game);
  }

  async create(dto: CreateGameDto): Promise<GameResponseDto> {
    if (dto.steamAppId !== undefined && dto.steamAppId !== null)
      await this.steamService.assertApp(dto.steamAppId);
    await this.assertCoverMedia(dto.coverMediaId);
    const data: Prisma.GameUncheckedCreateInput = {
      title: dto.title,
      steamAppId: dto.steamAppId ?? null,
      platform: dto.platform ?? null,
      coverMediaId: dto.coverMediaId,
      rating: dto.rating,
      playtimeHours: dto.playtimeHours,
      usesController: dto.usesController ?? false,
      likeLevel: dto.likeLevel,
      comment: dto.comment ?? null,
      isVisible: dto.isVisible ?? true,
      sortOrder: dto.sortOrder ?? 0,
    };
    const game = await this.prisma.game.create({
      data,
      include: { coverMedia: true },
    });
    return this.mapSingle(game);
  }

  async update(id: number, dto: UpdateGameDto): Promise<GameResponseDto> {
    if (dto.steamAppId !== undefined && dto.steamAppId !== null)
      await this.steamService.assertApp(dto.steamAppId);
    if (dto.coverMediaId !== undefined) {
      await this.assertCoverMedia(dto.coverMediaId);
    }

    const data: Prisma.GameUncheckedUpdateInput = {};
    if (dto.steamAppId !== undefined) data.steamAppId = dto.steamAppId;
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.platform !== undefined) data.platform = dto.platform;
    if (dto.coverMediaId !== undefined) data.coverMediaId = dto.coverMediaId;
    if (dto.rating !== undefined) data.rating = dto.rating;
    if (dto.playtimeHours !== undefined) data.playtimeHours = dto.playtimeHours;
    if (dto.usesController !== undefined) data.usesController = dto.usesController;
    if (dto.likeLevel !== undefined) data.likeLevel = dto.likeLevel;
    if (dto.comment !== undefined) data.comment = dto.comment;
    if (dto.isVisible !== undefined) data.isVisible = dto.isVisible;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;

    const game = await this.prisma.game.update({
      where: { id },
      data,
      include: { coverMedia: true },
    });
    return this.mapSingle(game);
  }

  async remove(id: number): Promise<void> {
    await this.prisma.game.delete({ where: { id } });
  }

  async reorder(dto: ReorderDto): Promise<void> {
    this.assertUniqueReorder(dto);
    const ids = dto.items.map((item) => item.id);
    const existing = await this.prisma.game.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    if (existing.length !== ids.length) {
      const existingIds = new Set(existing.map((game) => game.id));
      const missingIds = ids.filter((id) => !existingIds.has(id));
      throw new NotFoundException(`Games not found: ${missingIds.join(', ')}`);
    }

    await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.game.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );
  }

  private async assertCoverMedia(id: number): Promise<void> {
    const media = await this.prisma.mediaAsset.findUnique({
      where: { id },
      select: { kind: true },
    });
    if (media === null) {
      throw new NotFoundException('Cover media asset not found');
    }
    if (media.kind !== MediaKind.IMAGE) {
      throw new BadRequestException('coverMediaId must reference an IMAGE media asset');
    }
  }

  private assertUniqueReorder(dto: ReorderDto): void {
    const ids = dto.items.map((item) => item.id);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Reorder items contain duplicate ids');
    }
    const orders = dto.items.map((item) => item.sortOrder);
    if (new Set(orders).size !== orders.length) {
      throw new BadRequestException('Reorder items contain duplicate sortOrder values');
    }
  }

  private async mapGames(games: GameWithCover[]): Promise<GameResponseDto[]> {
    const stats = await this.steamService.forAppIds(
      games.flatMap((g) => (g.steamAppId === null ? [] : [g.steamAppId])),
    );
    return games.map((g) =>
      this.mapGame(g, g.steamAppId === null ? null : (stats.get(g.steamAppId) ?? null)),
    );
  }

  private async mapSingle(game: GameWithCover): Promise<GameResponseDto> {
    const stats = await this.steamService.forAppIds(
      game.steamAppId === null ? [] : [game.steamAppId],
    );
    return this.mapGame(
      game,
      game.steamAppId === null ? null : (stats.get(game.steamAppId) ?? null),
    );
  }

  private mapGame(game: GameWithCover, steam: SteamGameDto | null): GameResponseDto {
    return {
      id: game.id,
      steamAppId: game.steamAppId,
      steam,
      manualPlaytimeHours: game.playtimeHours,
      title: game.title,
      platform: game.platform,
      usesController: game.usesController,
      coverMediaId: game.coverMediaId,
      cover: this.mapMedia(game.coverMedia),
      rating: Number(game.rating),
      playtimeHours:
        game.playtimeHours > 0
          ? game.playtimeHours
          : steam === null
            ? 0
            : Math.floor(steam.playtimeMinutes / 60),
      likeLevel: game.likeLevel,
      comment: game.comment,
      isVisible: game.isVisible,
      sortOrder: game.sortOrder,
      createdAt: game.createdAt.toISOString(),
      updatedAt: game.updatedAt.toISOString(),
    };
  }

  private mapMedia(media: MediaAsset): GameMediaResponseDto {
    const encodedKey = media.objectKey
      .replace(/^\/+/, '')
      .split('/')
      .map((part) => encodeURIComponent(part))
      .join('/');
    return {
      id: media.id,
      url: `${this.config.mediaPublicBaseUrl}/${encodedKey}`,
      mimeType: media.mimeType,
      sizeBytes: media.sizeBytes,
      width: media.width,
      height: media.height,
      altText: media.altText,
      kind: media.kind,
      createdAt: media.createdAt.toISOString(),
    };
  }
}
