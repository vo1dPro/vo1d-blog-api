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
import { CreatePhotoDto } from './dto/create-photo.dto.js';
import { PhotoPageResponseDto, PhotoResponseDto } from './dto/photo-response.dto.js';
import { UpdatePhotoDto } from './dto/update-photo.dto.js';
import { PhotosService } from './photos.service.js';

@ApiTags('admin/photos')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'A valid administrator session is required' })
@UseGuards(SessionAuthGuard)
@Controller({ path: 'admin/photos' })
export class AdminPhotosController {
  constructor(private readonly photosService: PhotosService) {}

  @Get()
  @ApiOperation({ summary: 'List all photos, including hidden records' })
  @ApiOkResponse({ type: PhotoPageResponseDto })
  findAll(@Query() query: PaginationQueryDto): Promise<PhotoPageResponseDto> {
    return this.photosService.findAllAdmin(query);
  }

  @Patch('reorder')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Atomically update photo display positions' })
  @ApiNoContentResponse({ description: 'Photo display positions updated' })
  @ApiBadRequestResponse({ description: 'Duplicate IDs or display positions' })
  @ApiNotFoundResponse({ description: 'At least one photo does not exist' })
  reorder(@Body() body: ReorderDto): Promise<void> {
    return this.photosService.reorder(body);
  }

  @Post()
  @ApiOperation({ summary: 'Create a photo' })
  @ApiCreatedResponse({ type: PhotoResponseDto })
  @ApiBadRequestResponse({ description: 'Input or media relationship is invalid' })
  @ApiNotFoundResponse({ description: 'Original or thumbnail media asset not found' })
  create(@Body() body: CreatePhotoDto): Promise<PhotoResponseDto> {
    return this.photosService.create(body);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one photo for administration' })
  @ApiOkResponse({ type: PhotoResponseDto })
  @ApiNotFoundResponse({ description: 'Photo not found' })
  findOne(@Param() params: IdParamDto): Promise<PhotoResponseDto> {
    return this.photosService.findOneAdmin(params.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a photo' })
  @ApiOkResponse({ type: PhotoResponseDto })
  @ApiBadRequestResponse({ description: 'Input or media relationship is invalid' })
  @ApiNotFoundResponse({ description: 'Photo or media asset not found' })
  update(@Param() params: IdParamDto, @Body() body: UpdatePhotoDto): Promise<PhotoResponseDto> {
    return this.photosService.update(params.id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a photo' })
  @ApiNoContentResponse({ description: 'Photo deleted' })
  @ApiNotFoundResponse({ description: 'Photo not found' })
  remove(@Param() params: IdParamDto): Promise<void> {
    return this.photosService.remove(params.id);
  }
}
