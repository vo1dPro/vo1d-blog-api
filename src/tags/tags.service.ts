import type { PaginationQueryDto, PaginatedResponseDto } from '../common/dto/pagination.dto.js';
import { Injectable, NotFoundException } from '@nestjs/common';
import { ArticleStatus, type Tag } from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma.service.js';
import type { CreateTagDto } from './dto/create-tag.dto.js';
import type { UpdateTagDto } from './dto/update-tag.dto.js';

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublic(query: PaginationQueryDto): Promise<PaginatedResponseDto<Tag>> {
    const where = {
      articles: {
        some: {
          article: {
            status: ArticleStatus.PUBLISHED,
            publishedAt: { lte: new Date() },
            category: { isVisible: true },
          },
        },
      },
    };
    const [records, total] = await this.prisma.$transaction(
      [
        this.prisma.tag.findMany({
          where,
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.prisma.tag.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      items: records,
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  async listAdmin(query: PaginationQueryDto): Promise<PaginatedResponseDto<Tag>> {
    const where = {};
    const [records, total] = await this.prisma.$transaction(
      [
        this.prisma.tag.findMany({
          where,
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.prisma.tag.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      items: records,
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  async findOne(id: number): Promise<Tag> {
    const tag = await this.prisma.tag.findUnique({ where: { id } });
    if (tag === null) {
      throw new NotFoundException('Tag not found');
    }
    return tag;
  }

  create(dto: CreateTagDto): Promise<Tag> {
    return this.prisma.tag.create({
      data: {
        slug: dto.slug,
        name: dto.name.trim(),
      },
    });
  }

  update(id: number, dto: UpdateTagDto): Promise<Tag> {
    return this.prisma.tag.update({
      where: { id },
      data: {
        ...(dto.slug === undefined ? {} : { slug: dto.slug }),
        ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
      },
    });
  }

  async delete(id: number): Promise<void> {
    await this.prisma.tag.delete({ where: { id } });
  }
}
