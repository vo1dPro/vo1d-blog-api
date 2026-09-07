import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
  Max,
} from 'class-validator';

export class CreateSkillDto {
  @ApiProperty({ example: 'TypeScript', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  @Matches(/\S/u, { message: 'name must not be blank' })
  name!: string;

  @ApiProperty({ example: 'typescript', maxLength: 100 })
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'iconKey must contain only lowercase letters, numbers, or hyphens',
  })
  iconKey!: string;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 1 })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  iconMediaId?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 1 })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  darkIconMediaId?: number | null;

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
