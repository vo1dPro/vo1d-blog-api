import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ArticlesService } from './articles.service.js';
import { ArticleListQueryDto, RelatedQueryDto } from './dto/article.dto.js';
import type { ArticleDetailResponse, ArticleSummaryResponse } from './article.types.js';
import type { PaginatedResponseDto } from '../common/dto/pagination.dto.js';
import { ArticlePageResponseDto, ArticleDetailDto } from '../common/dto/api-response.dto.js';

@ApiTags('articles')
@Controller({ path: 'articles' })
export class ArticlesController {
  constructor(private readonly service: ArticlesService) {}

  @Get()
  @ApiOkResponse({ type: ArticlePageResponseDto })
  list(@Query() query: ArticleListQueryDto): Promise<{
    items: ArticleSummaryResponse[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }> {
    return this.service.listPublic(query);
  }

  @Get(':slugOrId/related')
  @ApiOkResponse({
    type: ArticlePageResponseDto,
    description: 'Related articles; page=1 and pageSize=limit',
  })
  @ApiNotFoundResponse({ description: 'Published article not found' })
  related(
    @Param('slugOrId') slugOrId: string,
    @Query() query: RelatedQueryDto,
  ): Promise<PaginatedResponseDto<ArticleSummaryResponse>> {
    return this.service.related(slugOrId, query.limit);
  }

  @Get(':slugOrId')
  @ApiOkResponse({ type: ArticleDetailDto })
  @ApiNotFoundResponse({ description: 'Published article not found' })
  get(@Param('slugOrId') slugOrId: string): Promise<ArticleDetailResponse> {
    return this.service.getPublic(slugOrId);
  }
}
