import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { IdParamDto } from '../common/dto/id-param.dto.js';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import { CreationsService } from './creations.service.js';

class ImportCreationDto {
  @ApiProperty({ example: 'https://x.com/vo1dZzz/status/1234567890123456789' })
  @IsString()
  @MaxLength(500)
  url!: string;
}

@ApiTags('creations')
@Controller('creations')
export class CreationsController {
  constructor(private readonly service: CreationsService) {}
  @Get()
  feed(@Query() query: PaginationQueryDto) { return this.service.feed(query); }
}

@ApiTags('admin/creations')
@ApiCookieAuth()
@UseGuards(SessionAuthGuard)
@Controller('admin/creations')
export class AdminCreationsController {
  constructor(private readonly service: CreationsService) {}
  @Get('status')
  status() { return { owner: this.service.owner, profileUrl: `https://x.com/${this.service.owner}`, automaticSync: false }; }
  @Get()
  list(@Query() query: PaginationQueryDto) { return this.service.list(query); }
  @Post('import-x')
  importX(@Body() body: ImportCreationDto) { return this.service.importX(body.url); }
  @Delete(':id')
  @HttpCode(204)
  delete(@Param() params: IdParamDto) { return this.service.delete(params.id); }
}
