import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
  Max,
} from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({ example: 'backend', maxLength: 100 })
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/, {
    message: 'key must contain only lowercase letters, numbers, hyphens, or underscores',
  })
  key!: string;

  @ApiProperty({ example: 'Backend', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  @Matches(/\S/u, { message: 'label must not be blank' })
  label!: string;

  @ApiPropertyOptional({ example: 'Server', nullable: true, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/\S/u, { message: 'iconKey must not be blank' })
  iconKey?: string | null;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsInt()
  @Max(2_147_483_647)
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsBoolean()
  isVisible?: boolean;
}
