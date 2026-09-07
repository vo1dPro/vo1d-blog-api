import type { PaginationQueryDto, PaginatedResponseDto } from '../common/dto/pagination.dto.js';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { ReorderDto } from '../common/dto/reorder.dto.js';
import { AppConfigService } from '../config/app-config.service.js';
import { PrismaService } from '../database/prisma.service.js';
import type { MediaAsset, Prisma } from '../generated/prisma/client.js';
import { MediaKind } from '../generated/prisma/enums.js';
import type { CreatePhotoDto } from './dto/create-photo.dto.js';
import type { PhotoMediaResponseDto, PhotoResponseDto } from './dto/photo-response.dto.js';
import type { UpdatePhotoDto } from './dto/update-photo.dto.js';

type PhotoWithMedia = Prisma.PhotoGetPayload<{
  include: { originalMedia: true; thumbnailMedia: true };
}>;

@Injectable()
export class PhotosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async findPublic(query: PaginationQueryDto): Promise<PaginatedResponseDto<PhotoResponseDto>> {
    const where = { isVisible: true };
    const [records, total] = await this.prisma.$transaction(
      [
        this.prisma.photo.findMany({
          where,
          include: { originalMedia: true, thumbnailMedia: true },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.prisma.photo.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      items: records.map((record) => this.mapPhoto(record)),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  async findAllAdmin(query: PaginationQueryDto): Promise<PaginatedResponseDto<PhotoResponseDto>> {
    const where = {};
    const [records, total] = await this.prisma.$transaction(
      [
        this.prisma.photo.findMany({
          where,
          include: { originalMedia: true, thumbnailMedia: true },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.prisma.photo.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      items: records.map((record) => this.mapPhoto(record)),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  async findOneAdmin(id: number): Promise<PhotoResponseDto> {
    const photo = await this.prisma.photo.findUnique({
      where: { id },
      include: { originalMedia: true, thumbnailMedia: true },
    });
    if (photo === null) {
      throw new NotFoundException('Photo not found');
    }
    return this.mapPhoto(photo);
  }

  async create(dto: CreatePhotoDto): Promise<PhotoResponseDto> {
    await this.assertPhotoMediaPair(dto.originalMediaId, dto.thumbnailMediaId);
    const data: Prisma.PhotoUncheckedCreateInput = {
      originalMediaId: dto.originalMediaId,
      thumbnailMediaId: dto.thumbnailMediaId,
      alt: dto.alt,
      title: dto.title,
      description: dto.description,
      capturedAt: this.toNullableDate(dto.capturedAt),
      isVisible: dto.isVisible ?? true,
      sortOrder: dto.sortOrder ?? 0,
    };
    const photo = await this.prisma.photo.create({
      data,
      include: { originalMedia: true, thumbnailMedia: true },
    });
    return this.mapPhoto(photo);
  }

  async update(id: number, dto: UpdatePhotoDto): Promise<PhotoResponseDto> {
    if (dto.originalMediaId !== undefined || dto.thumbnailMediaId !== undefined) {
      const current = await this.prisma.photo.findUnique({
        where: { id },
        select: { originalMediaId: true, thumbnailMediaId: true },
      });
      if (current === null) {
        throw new NotFoundException('Photo not found');
      }
      await this.assertPhotoMediaPair(
        dto.originalMediaId ?? current.originalMediaId,
        dto.thumbnailMediaId ?? current.thumbnailMediaId,
      );
    }

    const data: Prisma.PhotoUncheckedUpdateInput = {};
    if (dto.originalMediaId !== undefined) data.originalMediaId = dto.originalMediaId;
    if (dto.thumbnailMediaId !== undefined) data.thumbnailMediaId = dto.thumbnailMediaId;
    if (dto.alt !== undefined) data.alt = dto.alt;
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.capturedAt !== undefined) data.capturedAt = this.toNullableDate(dto.capturedAt);
    if (dto.isVisible !== undefined) data.isVisible = dto.isVisible;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;

    const photo = await this.prisma.photo.update({
      where: { id },
      data,
      include: { originalMedia: true, thumbnailMedia: true },
    });
    return this.mapPhoto(photo);
  }

  async remove(id: number): Promise<void> {
    await this.prisma.photo.delete({ where: { id } });
  }

  async reorder(dto: ReorderDto): Promise<void> {
    this.assertUniqueReorder(dto);
    const ids = dto.items.map((item) => item.id);
    const existing = await this.prisma.photo.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    if (existing.length !== ids.length) {
      const existingIds = new Set(existing.map((photo) => photo.id));
      const missingIds = ids.filter((id) => !existingIds.has(id));
      throw new NotFoundException(`Photos not found: ${missingIds.join(', ')}`);
    }

    await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.photo.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );
  }

  private async assertPhotoMediaPair(
    originalMediaId: number,
    thumbnailMediaId: number,
  ): Promise<void> {
    if (originalMediaId === thumbnailMediaId) {
      throw new BadRequestException('Original and thumbnail media assets must be different');
    }

    const [original, thumbnail] = await Promise.all([
      this.prisma.mediaAsset.findUnique({
        where: { id: originalMediaId },
        select: { kind: true },
      }),
      this.prisma.mediaAsset.findUnique({
        where: { id: thumbnailMediaId },
        select: { kind: true },
      }),
    ]);
    if (original === null) {
      throw new NotFoundException('Original media asset not found');
    }
    if (thumbnail === null) {
      throw new NotFoundException('Thumbnail media asset not found');
    }
    if (original.kind !== MediaKind.PHOTO_ORIGINAL) {
      throw new BadRequestException('originalMediaId must reference a PHOTO_ORIGINAL media asset');
    }
    if (thumbnail.kind !== MediaKind.PHOTO_THUMBNAIL) {
      throw new BadRequestException(
        'thumbnailMediaId must reference a PHOTO_THUMBNAIL media asset',
      );
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

  private toNullableDate(value: string | null | undefined): Date | null {
    return value === null || value === undefined ? null : new Date(value);
  }

  private mapPhoto(photo: PhotoWithMedia): PhotoResponseDto {
    return {
      id: photo.id,
      originalMediaId: photo.originalMediaId,
      original: this.mapMedia(photo.originalMedia),
      thumbnailMediaId: photo.thumbnailMediaId,
      thumbnail: this.mapMedia(photo.thumbnailMedia),
      alt: photo.alt,
      title: photo.title,
      description: photo.description,
      capturedAt: photo.capturedAt?.toISOString() ?? null,
      isVisible: photo.isVisible,
      sortOrder: photo.sortOrder,
      createdAt: photo.createdAt.toISOString(),
      updatedAt: photo.updatedAt.toISOString(),
    };
  }

  private mapMedia(media: MediaAsset): PhotoMediaResponseDto {
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
