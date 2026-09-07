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
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { IdParamDto } from '../common/dto/id-param.dto.js';
import { ArticlesService } from './articles.service.js';
import { ArticleListQueryDto, CreateArticleDto, UpdateArticleDto } from './dto/article.dto.js';
import type { PaginatedResponseDto } from '../common/dto/pagination.dto.js';
import { AdminArticleDto, AdminArticlePageDto } from '../common/dto/api-response.dto.js';

@ApiTags('admin/articles')
@ApiCookieAuth()
@UseGuards(SessionAuthGuard)
@Controller({ path: 'admin/articles' })
export class AdminArticlesController {
  constructor(private readonly service: ArticlesService) {}

  @Get()
  @ApiOkResponse({ type: AdminArticlePageDto })
  list(
    @Query() query: ArticleListQueryDto,
  ): Promise<PaginatedResponseDto<Record<string, unknown>>> {
    return this.service.listAdmin(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: AdminArticleDto })
  get(@Param() params: IdParamDto): Promise<Record<string, unknown>> {
    return this.service.getAdmin(params.id);
  }

  @Post()
  @ApiCreatedResponse({ type: AdminArticleDto })
  @ApiConflictResponse({ description: 'Slug already exists' })
  create(@Body() body: CreateArticleDto): Promise<Record<string, unknown>> {
    return this.service.create(body);
  }

  @Patch(':id')
  @ApiOkResponse({ type: AdminArticleDto })
  @ApiConflictResponse({ description: 'Slug already exists' })
  update(
    @Param() params: IdParamDto,
    @Body() body: UpdateArticleDto,
  ): Promise<Record<string, unknown>> {
    return this.service.update(params.id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Article deleted' })
  delete(@Param() params: IdParamDto): Promise<void> {
    return this.service.delete(params.id);
  }
}
