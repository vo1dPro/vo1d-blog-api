import { Controller, Get, Post, Query, HttpCode, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import { SteamLibraryPageDto, SteamStatusDto, SteamLinkResultDto } from './steam.dto.js';
import { SteamService } from './steam.service.js';

@ApiTags('admin/steam')
@ApiCookieAuth()
@UseGuards(SessionAuthGuard)
@Controller('admin/steam')
export class SteamController {
  constructor(private readonly service: SteamService) {}
  @Get('status')
  @ApiOkResponse({ type: SteamStatusDto })
  status(): Promise<SteamStatusDto> {
    return this.service.status();
  }
  @Get('library')
  @ApiOkResponse({ type: SteamLibraryPageDto })
  library(@Query() query: PaginationQueryDto): Promise<SteamLibraryPageDto> {
    return this.service.library(query);
  }
  @Post('sync')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Sync configured owner library; durable cooldown also applies to manual sync',
  })
  @ApiOkResponse({ type: SteamStatusDto })
  sync(): Promise<SteamStatusDto> {
    return this.service.sync();
  }
  @Post('link-matches')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Link only unique exact normalized titles; preserve existing links and editorial fields',
  })
  @ApiOkResponse({ type: SteamLinkResultDto })
  link(): Promise<SteamLinkResultDto> {
    return this.service.linkMatches();
  }
}
