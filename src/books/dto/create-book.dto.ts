import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsHexColor,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateBookDto {
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  @Matches(/\S/, { message: 'title must contain at least one non-whitespace character' })
  title!: string;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  @Matches(/\S/, { message: 'author must contain at least one non-whitespace character' })
  author!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Max(2_147_483_647)
  @Min(1)
  coverMediaId!: number;

  @ApiProperty({ example: '#d7a536' })
  @IsHexColor()
  accent!: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/\S/, { message: 'sourceName must contain at least one non-whitespace character' })
  sourceName?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'https://example.com/book' })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  sourceUrl?: string | null;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Max(2_147_483_647)
  @Min(1)
  readingOrder!: number;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/, {
    message: 'Date-time must include a UTC or numeric timezone offset',
  })
  lastReadAt?: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/, {
    message: 'Date-time must include a UTC or numeric timezone offset',
  })
  startedAt?: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/, {
    message: 'Date-time must include a UTC or numeric timezone offset',
  })
  finishedAt?: string | null;

  @ApiPropertyOptional({ default: 0, minimum: 0, maximum: 100 })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(100)
  progress?: number;

  @ApiPropertyOptional({ default: true })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsBoolean()
  isVisible?: boolean;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsInt()
  @Max(2_147_483_647)
  @Min(0)
  sortOrder?: number;
}
