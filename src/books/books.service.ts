import type { PaginationQueryDto, PaginatedResponseDto } from '../common/dto/pagination.dto.js';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { ReorderDto } from '../common/dto/reorder.dto.js';
import { AppConfigService } from '../config/app-config.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { MediaKind } from '../generated/prisma/enums.js';
import type { MediaAsset, Prisma } from '../generated/prisma/client.js';
import type { BookMediaResponseDto, BookResponseDto } from './dto/book-response.dto.js';
import type { CreateBookDto } from './dto/create-book.dto.js';
import type { UpdateBookDto } from './dto/update-book.dto.js';

type BookWithCover = Prisma.BookGetPayload<{ include: { coverMedia: true } }>;

@Injectable()
export class BooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async findPublic(query: PaginationQueryDto): Promise<PaginatedResponseDto<BookResponseDto>> {
    const where = { isVisible: true };
    const [records, total] = await this.prisma.$transaction(
      [
        this.prisma.book.findMany({
          where,
          include: { coverMedia: true },
          orderBy: [{ sortOrder: 'asc' }, { readingOrder: 'asc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.prisma.book.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      items: records.map((record) => this.mapBook(record)),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  async findAllAdmin(query: PaginationQueryDto): Promise<PaginatedResponseDto<BookResponseDto>> {
    const where = {};
    const [records, total] = await this.prisma.$transaction(
      [
        this.prisma.book.findMany({
          where,
          include: { coverMedia: true },
          orderBy: [{ sortOrder: 'asc' }, { readingOrder: 'asc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.prisma.book.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      items: records.map((record) => this.mapBook(record)),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  async findOneAdmin(id: number): Promise<BookResponseDto> {
    const book = await this.prisma.book.findUnique({
      where: { id },
      include: { coverMedia: true },
    });
    if (book === null) {
      throw new NotFoundException('Book not found');
    }
    return this.mapBook(book);
  }

  async create(dto: CreateBookDto): Promise<BookResponseDto> {
    await this.assertCoverMedia(dto.coverMediaId);
    const data: Prisma.BookUncheckedCreateInput = {
      title: dto.title,
      author: dto.author,
      coverMediaId: dto.coverMediaId,
      accent: dto.accent,
      sourceName: dto.sourceName ?? null,
      sourceUrl: dto.sourceUrl ?? null,
      readingOrder: dto.readingOrder,
      readingNotes: dto.readingNotes ?? '',
      lastReadAt: this.toNullableDate(dto.lastReadAt),
      startedAt: this.toNullableDate(dto.startedAt),
      finishedAt: this.toNullableDate(dto.finishedAt),
      progress: dto.progress ?? 0,
      isVisible: dto.isVisible ?? true,
      sortOrder: dto.sortOrder ?? 0,
    };
    const book = await this.prisma.book.create({
      data,
      include: { coverMedia: true },
    });
    return this.mapBook(book);
  }

  async update(id: number, dto: UpdateBookDto): Promise<BookResponseDto> {
    if (dto.coverMediaId !== undefined) {
      await this.assertCoverMedia(dto.coverMediaId);
    }

    const data: Prisma.BookUncheckedUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.author !== undefined) data.author = dto.author;
    if (dto.coverMediaId !== undefined) data.coverMediaId = dto.coverMediaId;
    if (dto.accent !== undefined) data.accent = dto.accent;
    if (dto.sourceName !== undefined) data.sourceName = dto.sourceName;
    if (dto.sourceUrl !== undefined) data.sourceUrl = dto.sourceUrl;
    if (dto.readingOrder !== undefined) data.readingOrder = dto.readingOrder;
    if (dto.readingNotes !== undefined) data.readingNotes = dto.readingNotes;
    if (dto.lastReadAt !== undefined) data.lastReadAt = this.toNullableDate(dto.lastReadAt);
    if (dto.startedAt !== undefined) data.startedAt = this.toNullableDate(dto.startedAt);
    if (dto.finishedAt !== undefined) data.finishedAt = this.toNullableDate(dto.finishedAt);
    if (dto.progress !== undefined) data.progress = dto.progress;
    if (dto.isVisible !== undefined) data.isVisible = dto.isVisible;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;

    const book = await this.prisma.book.update({
      where: { id },
      data,
      include: { coverMedia: true },
    });
    return this.mapBook(book);
  }

  async remove(id: number): Promise<void> {
    await this.prisma.book.delete({ where: { id } });
  }

  async reorder(dto: ReorderDto): Promise<void> {
    this.assertUniqueReorder(dto);
    const ids = dto.items.map((item) => item.id);
    const existing = await this.prisma.book.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    if (existing.length !== ids.length) {
      const existingIds = new Set(existing.map((book) => book.id));
      const missingIds = ids.filter((id) => !existingIds.has(id));
      throw new NotFoundException(`Books not found: ${missingIds.join(', ')}`);
    }

    await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.book.update({
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

  private toNullableDate(value: string | null | undefined): Date | null {
    return value === null || value === undefined ? null : new Date(value);
  }

  private mapBook(book: BookWithCover): BookResponseDto {
    return {
      id: book.id,
      title: book.title,
      author: book.author,
      coverMediaId: book.coverMediaId,
      cover: this.mapMedia(book.coverMedia),
      accent: book.accent,
      sourceName: book.sourceName,
      sourceUrl: book.sourceUrl,
      readingOrder: book.readingOrder,
      readingNotes: book.readingNotes,
      lastReadAt: book.lastReadAt?.toISOString() ?? null,
      startedAt: book.startedAt?.toISOString() ?? null,
      finishedAt: book.finishedAt?.toISOString() ?? null,
      progress: book.progress,
      isVisible: book.isVisible,
      sortOrder: book.sortOrder,
      createdAt: book.createdAt.toISOString(),
      updatedAt: book.updatedAt.toISOString(),
    };
  }

  private mapMedia(media: MediaAsset): BookMediaResponseDto {
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
