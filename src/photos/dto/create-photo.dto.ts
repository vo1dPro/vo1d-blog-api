import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
  Max,
} from 'class-validator';

export class CreatePhotoDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Max(2_147_483_647)
  @Min(1)
  originalMediaId!: number;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Max(2_147_483_647)
  @Min(1)
  thumbnailMediaId!: number;

  @ApiProperty({ maxLength: 500 })
  @IsString()
  @MaxLength(500)
  @Matches(/\S/, { message: 'alt must contain at least one non-whitespace character' })
  alt!: string;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  @Matches(/\S/, { message: 'title must contain at least one non-whitespace character' })
  title!: string;

  @ApiProperty({ maxLength: 2_000 })
  @IsString()
  @MaxLength(2_000)
  description!: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/, {
    message: 'Date-time must include a UTC or numeric timezone offset',
  })
  capturedAt?: string | null;

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
