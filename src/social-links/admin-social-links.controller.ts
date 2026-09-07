import { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { IdParamDto } from '../common/dto/id-param.dto.js';
import { ReorderDto } from '../common/dto/reorder.dto.js';
import { CreateSocialLinkDto } from './dto/create-social-link.dto.js';
import {
  SocialLinkPageResponseDto,
  SocialLinkResponseDto,
} from './dto/social-link-response.dto.js';
import { UpdateSocialLinkDto } from './dto/update-social-link.dto.js';
import { SocialLinksService } from './social-links.service.js';

@ApiTags('admin/social-links')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Administrator session is missing or expired' })
@UseGuards(SessionAuthGuard)
@Controller({ path: 'admin/social-links' })
export class AdminSocialLinksController {
  constructor(private readonly socialLinksService: SocialLinksService) {}

  @Get()
  @ApiOperation({ summary: 'List all social links for administration' })
  @ApiOkResponse({ type: SocialLinkPageResponseDto })
  async list(@Query() query: PaginationQueryDto): Promise<SocialLinkPageResponseDto> {
    const socialLinks = await this.socialLinksService.listAdmin(query);
    return {
      ...socialLinks,
      items: socialLinks.items.map((socialLink) => SocialLinkResponseDto.fromModel(socialLink)),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a social link by id' })
  @ApiOkResponse({ type: SocialLinkResponseDto })
  @ApiNotFoundResponse({ description: 'Social link not found' })
  async get(@Param() params: IdParamDto): Promise<SocialLinkResponseDto> {
    return SocialLinkResponseDto.fromModel(await this.socialLinksService.findOne(params.id));
  }

  @Post()
  @ApiOperation({ summary: 'Create a social link' })
  @ApiCreatedResponse({ type: SocialLinkResponseDto })
  async create(@Body() body: CreateSocialLinkDto): Promise<SocialLinkResponseDto> {
    return SocialLinkResponseDto.fromModel(await this.socialLinksService.create(body));
  }

  @Patch('reorder')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Update social-link sort positions in one transaction' })
  @ApiNoContentResponse({ description: 'Display positions updated atomically' })
  @ApiBadRequestResponse({ description: 'The reorder payload is invalid' })
  @ApiNotFoundResponse({ description: 'A social-link id was not found' })
  async reorder(@Body() body: ReorderDto): Promise<void> {
    await this.socialLinksService.reorder(body.items);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a social link' })
  @ApiOkResponse({ type: SocialLinkResponseDto })
  @ApiNotFoundResponse({ description: 'Social link not found' })
  async update(
    @Param() params: IdParamDto,
    @Body() body: UpdateSocialLinkDto,
  ): Promise<SocialLinkResponseDto> {
    return SocialLinkResponseDto.fromModel(await this.socialLinksService.update(params.id, body));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a social link' })
  @ApiNoContentResponse({ description: 'Social link deleted' })
  @ApiNotFoundResponse({ description: 'Social link not found' })
  async delete(@Param() params: IdParamDto): Promise<void> {
    await this.socialLinksService.delete(params.id);
  }
}
