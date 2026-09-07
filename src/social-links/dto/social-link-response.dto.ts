import { ApiProperty } from '@nestjs/swagger';
import type { SocialLinkWithIcons } from '../social-links.service.js';
import { MediaResponseDto } from '../../common/dto/api-response.dto.js';

export class SocialLinkResponseDto {
  @ApiProperty({ minimum: 1 })
  id!: number;

  @ApiProperty({ example: 'GitHub' })
  name!: string;

  @ApiProperty({ example: 'github' })
  platform!: string;

  @ApiProperty({ example: 'https://github.com/vo1dPro', format: 'uri' })
  url!: string;

  @ApiProperty({ example: 'github' })
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

  static fromModel(socialLink: SocialLinkWithIcons): SocialLinkResponseDto {
    return {
      id: socialLink.id,
      name: socialLink.name,
      platform: socialLink.platform,
      url: socialLink.url,
      iconKey: socialLink.iconKey,
      iconMediaId: socialLink.iconMediaId,
      darkIconMediaId: socialLink.darkIconMediaId,
      icon: socialLink.icon,
      darkIcon: socialLink.darkIcon,
      sortOrder: socialLink.sortOrder,
      isVisible: socialLink.isVisible,
      createdAt: socialLink.createdAt.toISOString(),
      updatedAt: socialLink.updatedAt.toISOString(),
    };
  }
}

export class SocialLinkPageResponseDto {
  @ApiProperty({ type: [SocialLinkResponseDto] })
  items!: SocialLinkResponseDto[];

  @ApiProperty({ minimum: 1 })
  page!: number;

  @ApiProperty({ minimum: 1, maximum: 50 })
  pageSize!: number;

  @ApiProperty({ minimum: 0 })
  total!: number;

  @ApiProperty({ minimum: 0 })
  totalPages!: number;
}
