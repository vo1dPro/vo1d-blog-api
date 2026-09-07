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
import { SkillsService } from './skills.service.js';
import { CreateSkillDto } from './dto/create-skill.dto.js';
import { SkillPageResponseDto, SkillResponseDto } from './dto/skill-response.dto.js';
import { UpdateSkillDto } from './dto/update-skill.dto.js';

@ApiTags('admin/skills')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Administrator session is missing or expired' })
@UseGuards(SessionAuthGuard)
@Controller({ path: 'admin/skills' })
export class AdminSkillsController {
  constructor(private readonly skillsService: SkillsService) {}

  @Get()
  @ApiOperation({ summary: 'List all skills for administration' })
  @ApiOkResponse({ type: SkillPageResponseDto })
  async list(@Query() query: PaginationQueryDto): Promise<SkillPageResponseDto> {
    const skills = await this.skillsService.listAdmin(query);
    return { ...skills, items: skills.items.map((skill) => SkillResponseDto.fromModel(skill)) };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a skill by id' })
  @ApiOkResponse({ type: SkillResponseDto })
  @ApiNotFoundResponse({ description: 'Skill not found' })
  async get(@Param() params: IdParamDto): Promise<SkillResponseDto> {
    return SkillResponseDto.fromModel(await this.skillsService.findOne(params.id));
  }

  @Post()
  @ApiOperation({ summary: 'Create a skill' })
  @ApiCreatedResponse({ type: SkillResponseDto })
  async create(@Body() body: CreateSkillDto): Promise<SkillResponseDto> {
    return SkillResponseDto.fromModel(await this.skillsService.create(body));
  }

  @Patch('reorder')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Update skill sort positions in one transaction' })
  @ApiNoContentResponse({ description: 'Display positions updated atomically' })
  @ApiBadRequestResponse({ description: 'The reorder payload is invalid' })
  @ApiNotFoundResponse({ description: 'A skill id was not found' })
  async reorder(@Body() body: ReorderDto): Promise<void> {
    await this.skillsService.reorder(body.items);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a skill' })
  @ApiOkResponse({ type: SkillResponseDto })
  @ApiNotFoundResponse({ description: 'Skill not found' })
  async update(
    @Param() params: IdParamDto,
    @Body() body: UpdateSkillDto,
  ): Promise<SkillResponseDto> {
    return SkillResponseDto.fromModel(await this.skillsService.update(params.id, body));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a skill' })
  @ApiNoContentResponse({ description: 'Skill deleted' })
  @ApiNotFoundResponse({ description: 'Skill not found' })
  async delete(@Param() params: IdParamDto): Promise<void> {
    await this.skillsService.delete(params.id);
  }
}
