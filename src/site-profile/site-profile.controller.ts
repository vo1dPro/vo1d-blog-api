import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { SiteProfileService } from './site-profile.service.js';
import { SiteProfileResponseDto } from '../common/dto/api-response.dto.js';

@ApiTags('site-profile')
@Controller({ path: 'site-profile' })
export class SiteProfileController {
  constructor(private readonly service: SiteProfileService) {}

  @Get()
  @ApiOkResponse({ type: SiteProfileResponseDto })
  get(): Promise<Record<string, unknown>> {
    return this.service.getPublic();
  }
}
