import { ApiProperty } from '@nestjs/swagger';
import type { SkillWithIcons } from '../skills.service.js';
import { MediaResponseDto } from '../../common/dto/api-response.dto.js';

export class SkillResponseDto {
  @ApiProperty({ minimum: 1 })
  id!: number;

  @ApiProperty({ example: 'TypeScript' })
  name!: string;

  @ApiProperty({ example: 'typescript' })
  iconKey!: string;

  @ApiProperty({ type: Number, nullable: true }) iconMediaId!: number | null;
  @ApiProperty({ type: Number, nullable: true }) darkIconMediaId!: number | null;
  @ApiProperty({ type: MediaResponseDto, nullable: true }) icon!: MediaResponseDto | null;
  @ApiProperty({ type: MediaResponseDto, nullable: true }) darkIcon!: MediaResponseDto | null;

  @ApiProperty({ minimum: 0 })
  sortOrder!: number;

  @ApiProperty()
  isVisible!: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  static fromModel(skill: SkillWithIcons): SkillResponseDto {
    return {
      id: skill.id,
      name: skill.name,
      iconKey: skill.iconKey,
      iconMediaId: skill.iconMediaId,
      darkIconMediaId: skill.darkIconMediaId,
      icon: skill.icon,
      darkIcon: skill.darkIcon,
      sortOrder: skill.sortOrder,
      isVisible: skill.isVisible,
      createdAt: skill.createdAt.toISOString(),
      updatedAt: skill.updatedAt.toISOString(),
    };
  }
}

export class SkillPageResponseDto {
  @ApiProperty({ type: [SkillResponseDto] })
  items!: SkillResponseDto[];

  @ApiProperty({ minimum: 1 })
  page!: number;

  @ApiProperty({ minimum: 1, maximum: 50 })
  pageSize!: number;

  @ApiProperty({ minimum: 0 })
  total!: number;

  @ApiProperty({ minimum: 0 })
  totalPages!: number;
}
