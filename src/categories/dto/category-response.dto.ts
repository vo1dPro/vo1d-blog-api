import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { Category } from '../../generated/prisma/client.js';

export class CategoryResponseDto {
  @ApiProperty({ minimum: 1 })
  id!: number;

  @ApiProperty({ example: 'backend' })
  key!: string;

  @ApiProperty({ example: 'Backend' })
  label!: string;

  @ApiPropertyOptional({ example: 'Server', nullable: true })
  iconKey!: string | null;

  @ApiProperty({ minimum: 0 })
  sortOrder!: number;

  @ApiProperty()
  isVisible!: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  static fromModel(category: Category): CategoryResponseDto {
    return {
      id: category.id,
      key: category.key,
      label: category.label,
      iconKey: category.iconKey,
      sortOrder: category.sortOrder,
      isVisible: category.isVisible,
      createdAt: category.createdAt.toISOString(),
      updatedAt: category.updatedAt.toISOString(),
    };
  }
}

export class CategoryPageResponseDto {
  @ApiProperty({ type: [CategoryResponseDto] })
  items!: CategoryResponseDto[];

  @ApiProperty({ minimum: 1 })
  page!: number;

  @ApiProperty({ minimum: 1, maximum: 50 })
  pageSize!: number;

  @ApiProperty({ minimum: 0 })
  total!: number;

  @ApiProperty({ minimum: 0 })
  totalPages!: number;
}
