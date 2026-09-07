import { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkillsService } from './skills.service.js';
import { SkillPageResponseDto, SkillResponseDto } from './dto/skill-response.dto.js';

@ApiTags('skills')
@Controller({ path: 'skills' })
export class SkillsController {
  constructor(private readonly skillsService: SkillsService) {}

  @Get()
  @ApiOperation({ summary: 'List visible skills' })
  @ApiOkResponse({ type: SkillPageResponseDto })
  async list(@Query() query: PaginationQueryDto): Promise<SkillPageResponseDto> {
    const skills = await this.skillsService.listPublic(query);
    return { ...skills, items: skills.items.map((skill) => SkillResponseDto.fromModel(skill)) };
  }
}
