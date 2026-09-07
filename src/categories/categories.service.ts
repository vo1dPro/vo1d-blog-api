import type { PaginationQueryDto, PaginatedResponseDto } from '../common/dto/pagination.dto.js';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Category } from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma.service.js';
import type { ReorderItemDto } from '../common/dto/reorder.dto.js';
import type { CreateCategoryDto } from './dto/create-category.dto.js';
import type { UpdateCategoryDto } from './dto/update-category.dto.js';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublic(query: PaginationQueryDto): Promise<PaginatedResponseDto<Category>> {
    const where = { isVisible: true };
    const [records, total] = await this.prisma.$transaction(
      [
        this.prisma.category.findMany({
          where,
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.prisma.category.count({ where }),
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

  async listAdmin(query: PaginationQueryDto): Promise<PaginatedResponseDto<Category>> {
    const where = {};
    const [records, total] = await this.prisma.$transaction(
      [
        this.prisma.category.findMany({
          where,
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.prisma.category.count({ where }),
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

  async findOne(id: number): Promise<Category> {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (category === null) {
      throw new NotFoundException('Category not found');
    }
    return category;
  }

  create(dto: CreateCategoryDto): Promise<Category> {
    return this.prisma.category.create({
      data: {
        key: dto.key,
        label: dto.label.trim(),
        ...(dto.iconKey === undefined ? {} : { iconKey: dto.iconKey?.trim() ?? null }),
        ...(dto.sortOrder === undefined ? {} : { sortOrder: dto.sortOrder }),
        ...(dto.isVisible === undefined ? {} : { isVisible: dto.isVisible }),
      },
    });
  }

  update(id: number, dto: UpdateCategoryDto): Promise<Category> {
    return this.prisma.category.update({
      where: { id },
      data: {
        ...(dto.key === undefined ? {} : { key: dto.key }),
        ...(dto.label === undefined ? {} : { label: dto.label.trim() }),
        ...(dto.iconKey === undefined ? {} : { iconKey: dto.iconKey?.trim() ?? null }),
        ...(dto.sortOrder === undefined ? {} : { sortOrder: dto.sortOrder }),
        ...(dto.isVisible === undefined ? {} : { isVisible: dto.isVisible }),
      },
    });
  }

  async delete(id: number): Promise<void> {
    await this.prisma.category.delete({ where: { id } });
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
        this.prisma.category.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );
  }
}
