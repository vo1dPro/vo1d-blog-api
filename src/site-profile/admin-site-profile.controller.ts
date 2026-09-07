import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { UpdateSiteProfileDto } from './dto/site-profile.dto.js';
import { SiteProfileService } from './site-profile.service.js';
import { AdminSiteProfileResponseDto } from '../common/dto/api-response.dto.js';

@ApiTags('admin/site-profile')
@ApiCookieAuth()
@UseGuards(SessionAuthGuard)
@Controller({ path: 'admin/site-profile' })
export class AdminSiteProfileController {
  constructor(private readonly service: SiteProfileService) {}

  @Get()
  @ApiOkResponse({ type: AdminSiteProfileResponseDto })
  get(): Promise<Record<string, unknown>> {
    return this.service.getAdmin();
  }

  @Patch()
  @ApiOkResponse({ type: AdminSiteProfileResponseDto })
  update(@Body() body: UpdateSiteProfileDto): Promise<Record<string, unknown>> {
    return this.service.update(body);
  }
}
