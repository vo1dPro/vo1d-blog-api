import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

export class CreateTagDto {
  @ApiProperty({ example: 'typescript', maxLength: 100 })
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must contain only lowercase letters, numbers, or hyphens',
  })
  slug!: string;

  @ApiProperty({ example: 'TypeScript', maxLength: 100 })
  @IsString()
  @MaxLength(100)
  @Matches(/\S/u, { message: 'name must not be blank' })
  name!: string;
}
