import { ApiProperty } from '@nestjs/swagger';
import { MediaKind } from '../../generated/prisma/enums.js';

export class BookMediaResponseDto {
  @ApiProperty()
  id!: number;

  @ApiProperty({ format: 'uri' })
  url!: string;

  @ApiProperty()
  mimeType!: string;

  @ApiProperty({ minimum: 0 })
  sizeBytes!: number;

  @ApiProperty({ type: Number, nullable: true })
  width!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  height!: number | null;

  @ApiProperty({ type: String, nullable: true })
  altText!: string | null;

  @ApiProperty({ enum: MediaKind })
  kind!: MediaKind;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class BookResponseDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  author!: string;

  @ApiProperty()
  coverMediaId!: number;

  @ApiProperty({ type: BookMediaResponseDto })
  cover!: BookMediaResponseDto;

  @ApiProperty()
  accent!: string;

  @ApiProperty({ type: String, nullable: true })
  sourceName!: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'uri' })
  sourceUrl!: string | null;

  @ApiProperty()
  readingOrder!: number;

  @ApiProperty({ maxLength: 50000 })
  readingNotes!: string;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  lastReadAt!: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  startedAt!: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  finishedAt!: string | null;

  @ApiProperty({ minimum: 0, maximum: 100 })
  progress!: number;

  @ApiProperty()
  isVisible!: boolean;

  @ApiProperty({ minimum: 0 })
  sortOrder!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class BookPageResponseDto {
  @ApiProperty({ type: [BookResponseDto] })
  items!: BookResponseDto[];

  @ApiProperty({ minimum: 1 })
  page!: number;

  @ApiProperty({ minimum: 1, maximum: 50 })
  pageSize!: number;

  @ApiProperty({ minimum: 0 })
  total!: number;

  @ApiProperty({ minimum: 0 })
  totalPages!: number;
}
