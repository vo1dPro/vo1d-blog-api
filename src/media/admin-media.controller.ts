import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiTags,
  ApiOkResponse,
  ApiExtraModels,
  getSchemaPath,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { IdParamDto } from '../common/dto/id-param.dto.js';
import { UploadMediaDto } from './dto/upload-media.dto.js';
import { MediaService } from './media.service.js';
import type { MediaResponse } from './media.types.js';
import { PaginationQueryDto, type PaginatedResponseDto } from '../common/dto/pagination.dto.js';
import {
  MediaPageResponseDto,
  MediaUploadResponseDto,
  PhotoUploadResponseDto,
} from '../common/dto/api-response.dto.js';

@ApiTags('admin/media')
@ApiExtraModels(MediaUploadResponseDto, PhotoUploadResponseDto)
@ApiCookieAuth()
@UseGuards(SessionAuthGuard)
@Controller({ path: 'admin/media' })
export class AdminMediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Get()
  @ApiOkResponse({ type: MediaPageResponseDto })
  list(@Query() query: PaginationQueryDto): Promise<PaginatedResponseDto<MediaResponse>> {
    return this.mediaService.list(query);
  }

  @Post('images')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        purpose: { type: 'string', enum: ['IMAGE', 'PHOTO', 'ICON'], default: 'IMAGE' },
        altText: { type: 'string', maxLength: 500 },
      },
    },
  })
  @ApiCreatedResponse({
    schema: {
      oneOf: [
        { $ref: getSchemaPath(MediaUploadResponseDto) },
        { $ref: getSchemaPath(PhotoUploadResponseDto) },
      ],
    },
  })
  upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() query: UploadMediaDto,
  ): Promise<{ asset: MediaResponse } | { original: MediaResponse; thumbnail: MediaResponse }> {
    return this.mediaService.upload(file, query.purpose, query.altText);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Unreferenced media asset deleted' })
  delete(@Param() params: IdParamDto): Promise<void> {
    return this.mediaService.deleteUnreferenced(params.id);
  }
}
