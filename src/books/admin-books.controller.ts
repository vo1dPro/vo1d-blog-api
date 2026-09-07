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
import { BooksService } from './books.service.js';
import { BookPageResponseDto, BookResponseDto } from './dto/book-response.dto.js';
import { CreateBookDto } from './dto/create-book.dto.js';
import { UpdateBookDto } from './dto/update-book.dto.js';

@ApiTags('admin/books')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'A valid administrator session is required' })
@UseGuards(SessionAuthGuard)
@Controller({ path: 'admin/books' })
export class AdminBooksController {
  constructor(private readonly booksService: BooksService) {}

  @Get()
  @ApiOperation({ summary: 'List all books, including hidden records' })
  @ApiOkResponse({ type: BookPageResponseDto })
  findAll(@Query() query: PaginationQueryDto): Promise<BookPageResponseDto> {
    return this.booksService.findAllAdmin(query);
  }

  @Patch('reorder')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Atomically update book display positions' })
  @ApiNoContentResponse({ description: 'Book display positions updated' })
  @ApiBadRequestResponse({ description: 'Duplicate IDs or display positions' })
  @ApiNotFoundResponse({ description: 'At least one book does not exist' })
  reorder(@Body() body: ReorderDto): Promise<void> {
    return this.booksService.reorder(body);
  }

  @Post()
  @ApiOperation({ summary: 'Create a book' })
  @ApiCreatedResponse({ type: BookResponseDto })
  @ApiBadRequestResponse({ description: 'Input or cover media kind is invalid' })
  @ApiNotFoundResponse({ description: 'Cover media asset not found' })
  create(@Body() body: CreateBookDto): Promise<BookResponseDto> {
    return this.booksService.create(body);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one book for administration' })
  @ApiOkResponse({ type: BookResponseDto })
  @ApiNotFoundResponse({ description: 'Book not found' })
  findOne(@Param() params: IdParamDto): Promise<BookResponseDto> {
    return this.booksService.findOneAdmin(params.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a book' })
  @ApiOkResponse({ type: BookResponseDto })
  @ApiBadRequestResponse({ description: 'Input or cover media kind is invalid' })
  @ApiNotFoundResponse({ description: 'Book or cover media asset not found' })
  update(@Param() params: IdParamDto, @Body() body: UpdateBookDto): Promise<BookResponseDto> {
    return this.booksService.update(params.id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a book' })
  @ApiNoContentResponse({ description: 'Book deleted' })
  @ApiNotFoundResponse({ description: 'Book not found' })
  remove(@Param() params: IdParamDto): Promise<void> {
    return this.booksService.remove(params.id);
  }
}
