import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { UploadPurpose } from '../media.types.js';

export class UploadMediaDto {
  @ApiPropertyOptional({ enum: ['IMAGE', 'PHOTO', 'ICON'], default: 'IMAGE' })
  @IsOptional()
  @IsIn(['IMAGE', 'PHOTO', 'ICON'])
  purpose: UploadPurpose = 'IMAGE';

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  altText?: string;
}
