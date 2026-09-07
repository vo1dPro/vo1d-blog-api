import { ApiProperty } from '@nestjs/swagger';
import { MediaKind } from '../../generated/prisma/enums.js';

export class PhotoMediaResponseDto {
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

export class PhotoResponseDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  originalMediaId!: number;

  @ApiProperty({ type: PhotoMediaResponseDto })
  original!: PhotoMediaResponseDto;

  @ApiProperty()
  thumbnailMediaId!: number;

  @ApiProperty({ type: PhotoMediaResponseDto })
  thumbnail!: PhotoMediaResponseDto;

  @ApiProperty()
  alt!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  capturedAt!: string | null;

  @ApiProperty()
  isVisible!: boolean;

  @ApiProperty({ minimum: 0 })
  sortOrder!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class PhotoPageResponseDto {
  @ApiProperty({ type: [PhotoResponseDto] })
  items!: PhotoResponseDto[];

  @ApiProperty({ minimum: 1 })
  page!: number;

  @ApiProperty({ minimum: 1, maximum: 50 })
  pageSize!: number;

  @ApiProperty({ minimum: 0 })
  total!: number;

  @ApiProperty({ minimum: 0 })
  totalPages!: number;
}
