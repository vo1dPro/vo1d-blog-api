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
import { ReorderDto } from '../common/dto/reorder.dto.js';
import { CategoriesService } from './categories.service.js';
import { CategoryPageResponseDto, CategoryResponseDto } from './dto/category-response.dto.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';

@ApiTags('admin/categories')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Administrator session is missing or expired' })
@UseGuards(SessionAuthGuard)
@Controller({ path: 'admin/categories' })
export class AdminCategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'List all categories for administration' })
  @ApiOkResponse({ type: CategoryPageResponseDto })
  async list(@Query() query: PaginationQueryDto): Promise<CategoryPageResponseDto> {
    const categories = await this.categoriesService.listAdmin(query);
    return {
      ...categories,
      items: categories.items.map((category) => CategoryResponseDto.fromModel(category)),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a category by id' })
  @ApiOkResponse({ type: CategoryResponseDto })
  @ApiNotFoundResponse({ description: 'Category not found' })
  async get(@Param() params: IdParamDto): Promise<CategoryResponseDto> {
    return CategoryResponseDto.fromModel(await this.categoriesService.findOne(params.id));
  }

  @Post()
  @ApiOperation({ summary: 'Create a category' })
  @ApiCreatedResponse({ type: CategoryResponseDto })
  @ApiConflictResponse({ description: 'The category key already exists' })
  async create(@Body() body: CreateCategoryDto): Promise<CategoryResponseDto> {
    return CategoryResponseDto.fromModel(await this.categoriesService.create(body));
  }

  @Patch('reorder')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Update category sort positions in one transaction' })
  @ApiNoContentResponse({ description: 'Display positions updated atomically' })
  @ApiBadRequestResponse({ description: 'The reorder payload is invalid' })
  @ApiNotFoundResponse({ description: 'A category id was not found' })
  async reorder(@Body() body: ReorderDto): Promise<void> {
    await this.categoriesService.reorder(body.items);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a category' })
  @ApiOkResponse({ type: CategoryResponseDto })
  @ApiNotFoundResponse({ description: 'Category not found' })
  @ApiConflictResponse({ description: 'The category key already exists' })
  async update(
    @Param() params: IdParamDto,
    @Body() body: UpdateCategoryDto,
  ): Promise<CategoryResponseDto> {
    return CategoryResponseDto.fromModel(await this.categoriesService.update(params.id, body));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an unused category' })
  @ApiNoContentResponse({ description: 'Category deleted' })
  @ApiNotFoundResponse({ description: 'Category not found' })
  @ApiConflictResponse({ description: 'The category is referenced by an article' })
  async delete(@Param() params: IdParamDto): Promise<void> {
    await this.categoriesService.delete(params.id);
  }
}
