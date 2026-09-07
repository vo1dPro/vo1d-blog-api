import { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BooksService } from './books.service.js';
import { BookPageResponseDto } from './dto/book-response.dto.js';

@ApiTags('books')
@Controller({ path: 'books' })
export class BooksController {
  constructor(private readonly booksService: BooksService) {}

  @Get()
  @ApiOperation({ summary: 'List visible books in display order' })
  @ApiOkResponse({ type: BookPageResponseDto })
  findAll(@Query() query: PaginationQueryDto): Promise<BookPageResponseDto> {
    return this.booksService.findPublic(query);
  }
}
