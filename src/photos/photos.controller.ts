import { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PhotoPageResponseDto } from './dto/photo-response.dto.js';
import { PhotosService } from './photos.service.js';

@ApiTags('photos')
@Controller({ path: 'photos' })
export class PhotosController {
  constructor(private readonly photosService: PhotosService) {}

  @Get()
  @ApiOperation({ summary: 'List visible photos in display order' })
  @ApiOkResponse({ type: PhotoPageResponseDto })
  findAll(@Query() query: PaginationQueryDto): Promise<PhotoPageResponseDto> {
    return this.photosService.findPublic(query);
  }
}
