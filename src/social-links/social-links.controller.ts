import { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  SocialLinkPageResponseDto,
  SocialLinkResponseDto,
} from './dto/social-link-response.dto.js';
import { SocialLinksService } from './social-links.service.js';

@ApiTags('social-links')
@Controller({ path: 'social-links' })
export class SocialLinksController {
  constructor(private readonly socialLinksService: SocialLinksService) {}

  @Get()
  @ApiOperation({ summary: 'List visible social links' })
  @ApiOkResponse({ type: SocialLinkPageResponseDto })
  async list(@Query() query: PaginationQueryDto): Promise<SocialLinkPageResponseDto> {
    const socialLinks = await this.socialLinksService.listPublic(query);
    return {
      ...socialLinks,
      items: socialLinks.items.map((socialLink) => SocialLinkResponseDto.fromModel(socialLink)),
    };
  }
}
