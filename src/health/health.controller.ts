import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service.js';
import { HealthResponseDto } from '../common/dto/api-response.dto.js';

@ApiTags('health')
@Controller({ path: 'health' })
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOkResponse({ type: HealthResponseDto })
  @ApiServiceUnavailableResponse({ description: 'PostgreSQL is unavailable' })
  check(): Promise<{ status: 'ok'; database: 'up'; timestamp: string }> {
    return this.healthService.check();
  }
}
