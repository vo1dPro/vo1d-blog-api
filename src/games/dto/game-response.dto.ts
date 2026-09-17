import { ApiProperty } from '@nestjs/swagger';
import { MediaKind } from '../../generated/prisma/enums.js';
import { SteamGameDto } from '../../steam/steam.dto.js';

export class GameMediaResponseDto {
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

export class GameResponseDto {
  @ApiProperty({ type: Number, nullable: true }) steamAppId!: number | null;
  @ApiProperty({ type: SteamGameDto, nullable: true }) steam!: SteamGameDto | null;
  @ApiProperty({
    description:
      'Custom hours: positive values override Steam; 0 uses Steam. Legacy field name retained for compatibility.',
  })
  manualPlaytimeHours!: number;
  @ApiProperty()
  id!: number;

  @ApiProperty()
  title!: string;

  @ApiProperty({ type: String, nullable: true })
  platform!: string | null;

  @ApiProperty()
  coverMediaId!: number;

  @ApiProperty({ type: GameMediaResponseDto })
  cover!: GameMediaResponseDto;

  @ApiProperty({ minimum: 0, maximum: 10 })
  rating!: number;

  @ApiProperty({
    minimum: 0,
    description:
      'Effective display hours: custom hours when positive, otherwise aggregated Steam minutes rounded down to hours, or 0 when unavailable. Never add custom and Steam hours.',
  })
  playtimeHours!: number;

  @ApiProperty({ default: false })
  usesController!: boolean;

  @ApiProperty({ minimum: 0, maximum: 5 })
  likeLevel!: number;

  @ApiProperty({ type: String, nullable: true })
  comment!: string | null;

  @ApiProperty()
  isVisible!: boolean;

  @ApiProperty({ minimum: 0 })
  sortOrder!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class GamePageResponseDto {
  @ApiProperty({ type: [GameResponseDto] })
  items!: GameResponseDto[];

  @ApiProperty({ minimum: 1 })
  page!: number;

  @ApiProperty({ minimum: 1, maximum: 50 })
  pageSize!: number;

  @ApiProperty({ minimum: 0 })
  total!: number;

  @ApiProperty({ minimum: 0 })
  totalPages!: number;
}
