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
  ApiConflictResponse,
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
import { TagsService } from './tags.service.js';
import { CreateTagDto } from './dto/create-tag.dto.js';
import { TagPageResponseDto, TagResponseDto } from './dto/tag-response.dto.js';
import { UpdateTagDto } from './dto/update-tag.dto.js';

@ApiTags('admin/tags')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Administrator session is missing or expired' })
@UseGuards(SessionAuthGuard)
@Controller({ path: 'admin/tags' })
export class AdminTagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Get()
  @ApiOperation({ summary: 'List all tags for administration' })
  @ApiOkResponse({ type: TagPageResponseDto })
  async list(@Query() query: PaginationQueryDto): Promise<TagPageResponseDto> {
    const tags = await this.tagsService.listAdmin(query);
    return { ...tags, items: tags.items.map((tag) => TagResponseDto.fromModel(tag)) };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a tag by id' })
  @ApiOkResponse({ type: TagResponseDto })
  @ApiNotFoundResponse({ description: 'Tag not found' })
  async get(@Param() params: IdParamDto): Promise<TagResponseDto> {
    return TagResponseDto.fromModel(await this.tagsService.findOne(params.id));
  }

  @Post()
  @ApiOperation({ summary: 'Create a tag' })
  @ApiCreatedResponse({ type: TagResponseDto })
  @ApiConflictResponse({ description: 'The tag slug or name already exists' })
  async create(@Body() body: CreateTagDto): Promise<TagResponseDto> {
    return TagResponseDto.fromModel(await this.tagsService.create(body));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a tag' })
  @ApiOkResponse({ type: TagResponseDto })
  @ApiNotFoundResponse({ description: 'Tag not found' })
  @ApiConflictResponse({ description: 'The tag slug or name already exists' })
  async update(@Param() params: IdParamDto, @Body() body: UpdateTagDto): Promise<TagResponseDto> {
    return TagResponseDto.fromModel(await this.tagsService.update(params.id, body));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a tag and its article associations' })
  @ApiNoContentResponse({ description: 'Tag deleted' })
  @ApiNotFoundResponse({ description: 'Tag not found' })
  async delete(@Param() params: IdParamDto): Promise<void> {
    await this.tagsService.delete(params.id);
  }
}
