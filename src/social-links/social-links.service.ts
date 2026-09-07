import { MediaService } from '../media/media.service.js';
import type { MediaResponse } from '../media/media.types.js';
import type { PaginationQueryDto, PaginatedResponseDto } from '../common/dto/pagination.dto.js';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { ReorderItemDto } from '../common/dto/reorder.dto.js';
import { PrismaService } from '../database/prisma.service.js';
import type { SocialLink } from '../generated/prisma/client.js';
import type { CreateSocialLinkDto } from './dto/create-social-link.dto.js';
import type { UpdateSocialLinkDto } from './dto/update-social-link.dto.js';

export type SocialLinkWithIcons = SocialLink & {
  icon: MediaResponse | null;
  darkIcon: MediaResponse | null;
};

@Injectable()
export class SocialLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
  ) {}

  async listPublic(query: PaginationQueryDto): Promise<PaginatedResponseDto<SocialLinkWithIcons>> {
    const where = { isVisible: true };
    const [records, total] = await this.prisma.$transaction(
      [
        this.prisma.socialLink.findMany({
          where,
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.prisma.socialLink.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      items: await Promise.all(records.map((row) => this.withIcons(row))),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  async listAdmin(query: PaginationQueryDto): Promise<PaginatedResponseDto<SocialLinkWithIcons>> {
    const where = {};
    const [records, total] = await this.prisma.$transaction(
      [
        this.prisma.socialLink.findMany({
          where,
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.prisma.socialLink.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      items: await Promise.all(records.map((row) => this.withIcons(row))),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  async findOne(id: number): Promise<SocialLinkWithIcons> {
    const socialLink = await this.prisma.socialLink.findUnique({ where: { id } });
    if (socialLink === null) {
      throw new NotFoundException('Social link not found');
    }
    return this.withIcons(socialLink);
  }

  async create(dto: CreateSocialLinkDto): Promise<SocialLinkWithIcons> {
    await this.media.assertImageReferences([dto.iconMediaId, dto.darkIconMediaId]);
    const row = await this.prisma.socialLink.create({
      data: {
        name: dto.name.trim(),
        platform: dto.platform,
        url: dto.url,
        iconKey: dto.iconKey,
        iconMediaId: dto.iconMediaId ?? null,
        darkIconMediaId: dto.darkIconMediaId ?? null,
        ...(dto.sortOrder === undefined ? {} : { sortOrder: dto.sortOrder }),
        ...(dto.isVisible === undefined ? {} : { isVisible: dto.isVisible }),
      },
    });
    return this.withIcons(row);
  }

  async update(id: number, dto: UpdateSocialLinkDto): Promise<SocialLinkWithIcons> {
    await this.media.assertImageReferences([dto.iconMediaId, dto.darkIconMediaId]);
    const row = await this.prisma.socialLink.update({
      where: { id },
      data: {
        ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
        ...(dto.platform === undefined ? {} : { platform: dto.platform }),
        ...(dto.url === undefined ? {} : { url: dto.url }),
        ...(dto.iconKey === undefined ? {} : { iconKey: dto.iconKey }),
        ...(dto.iconMediaId === undefined ? {} : { iconMediaId: dto.iconMediaId }),
        ...(dto.darkIconMediaId === undefined ? {} : { darkIconMediaId: dto.darkIconMediaId }),
        ...(dto.sortOrder === undefined ? {} : { sortOrder: dto.sortOrder }),
        ...(dto.isVisible === undefined ? {} : { isVisible: dto.isVisible }),
      },
    });
    return this.withIcons(row);
  }

  async delete(id: number): Promise<void> {
    await this.prisma.socialLink.delete({ where: { id } });
  }

  async reorder(items: readonly ReorderItemDto[]): Promise<void> {
    const ids = items.map((item) => item.id);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Reorder items must contain unique ids');
    }
    if (new Set(items.map((item) => item.sortOrder)).size !== items.length) {
      throw new BadRequestException('Reorder items must contain unique sortOrder values');
    }

    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.socialLink.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );
  }
  private async withIcons(row: SocialLink): Promise<SocialLinkWithIcons> {
    const ids = [row.iconMediaId, row.darkIconMediaId].filter((id): id is number => id !== null);
    const assets = ids.length
      ? await this.prisma.mediaAsset.findMany({ where: { id: { in: ids } } })
      : [];
    const find = (id: number | null) => {
      const asset = assets.find((item) => item.id === id);
      return asset ? this.media.toResponse(asset) : null;
    };
    return { ...row, icon: find(row.iconMediaId), darkIcon: find(row.darkIconMediaId) };
  }
}
