import { ApiProperty } from '@nestjs/swagger';
import type { Tag } from '../../generated/prisma/client.js';

export class TagResponseDto {
  @ApiProperty({ minimum: 1 })
  id!: number;

  @ApiProperty({ example: 'typescript' })
  slug!: string;

  @ApiProperty({ example: 'TypeScript' })
  name!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  static fromModel(tag: Tag): TagResponseDto {
    return {
      id: tag.id,
      slug: tag.slug,
      name: tag.name,
      createdAt: tag.createdAt.toISOString(),
      updatedAt: tag.updatedAt.toISOString(),
    };
  }
}

export class TagPageResponseDto {
  @ApiProperty({ type: [TagResponseDto] })
  items!: TagResponseDto[];

  @ApiProperty({ minimum: 1 })
  page!: number;

  @ApiProperty({ minimum: 1, maximum: 50 })
  pageSize!: number;

  @ApiProperty({ minimum: 0 })
  total!: number;

  @ApiProperty({ minimum: 0 })
  totalPages!: number;
}
