import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateGameDto {
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 1,
    description: 'App ID from the configured owner Steam library; null unlinks',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  steamAppId?: number | null;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  @Matches(/\S/, { message: 'title must contain at least one non-whitespace character' })
  title!: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/\S/, { message: 'platform must contain at least one non-whitespace character' })
  platform?: string | null;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Max(2_147_483_647)
  @Min(1)
  coverMediaId!: number;

  @ApiProperty({ minimum: 0, maximum: 10, example: 8.5 })
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 1 })
  @Min(0)
  @Max(10)
  rating!: number;

  @ApiProperty({
    minimum: 0,
    description: 'Custom hours: positive values override Steam; 0 uses Steam hours.',
  })
  @IsInt()
  @Max(2_147_483_647)
  @Min(0)
  playtimeHours!: number;

  @ApiPropertyOptional({
    default: false,
    description: 'Whether this game is played with a controller',
  })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsBoolean()
  usesController?: boolean;

  @ApiProperty({ minimum: 0, maximum: 5 })
  @IsInt()
  @Min(0)
  @Max(5)
  likeLevel!: number;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 5_000 })
  @IsOptional()
  @IsString()
  @MaxLength(5_000)
  @Matches(/\S/, { message: 'comment must contain at least one non-whitespace character' })
  comment?: string | null;

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
