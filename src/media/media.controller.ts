import { Controller, Get, Param, Req, Res, StreamableFile } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { IdParamDto } from '../common/dto/id-param.dto.js';
import { MediaService } from './media.service.js';

@ApiTags('media')
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Get(':id/content')
  @ApiProduces('image/webp', 'image/png', 'image/jpeg')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @ApiNotFoundResponse({ description: 'Database image not found' })
  async content(
    @Param() params: IdParamDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile | undefined> {
    const content = await this.media.databaseContent(params.id);
    response.setHeader('ETag', `"${content.sha256}"`);
    response.setHeader('Cache-Control', 'public, max-age=86400');
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    if (request.fresh) {
      response.status(304);
      return undefined;
    }
    return new StreamableFile(Buffer.from(content.bytes), {
      type: content.media.mimeType,
      length: content.bytes.byteLength,
    });
  }
}
