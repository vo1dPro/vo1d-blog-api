import { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TagsService } from './tags.service.js';
import { TagPageResponseDto, TagResponseDto } from './dto/tag-response.dto.js';

@ApiTags('tags')
@Controller({ path: 'tags' })
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Get()
  @ApiOperation({ summary: 'List tags used by currently published articles' })
  @ApiOkResponse({ type: TagPageResponseDto })
  async list(@Query() query: PaginationQueryDto): Promise<TagPageResponseDto> {
    const tags = await this.tagsService.listPublic(query);
    return { ...tags, items: tags.items.map((tag) => TagResponseDto.fromModel(tag)) };
  }
}
