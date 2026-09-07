import { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CategoriesService } from './categories.service.js';
import { CategoryPageResponseDto, CategoryResponseDto } from './dto/category-response.dto.js';

@ApiTags('categories')
@Controller({ path: 'categories' })
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'List visible article categories' })
  @ApiOkResponse({ type: CategoryPageResponseDto })
  async list(@Query() query: PaginationQueryDto): Promise<CategoryPageResponseDto> {
    const categories = await this.categoriesService.listPublic(query);
    return {
      ...categories,
      items: categories.items.map((category) => CategoryResponseDto.fromModel(category)),
    };
  }
}
