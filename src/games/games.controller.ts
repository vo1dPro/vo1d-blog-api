import { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GamePageResponseDto } from './dto/game-response.dto.js';
import { GamesService } from './games.service.js';

@ApiTags('games')
@Controller({ path: 'games' })
export class GamesController {
  constructor(private readonly gamesService: GamesService) {}

  @Get()
  @ApiOperation({ summary: 'List visible games in display order' })
  @ApiOkResponse({ type: GamePageResponseDto })
  findAll(@Query() query: PaginationQueryDto): Promise<GamePageResponseDto> {
    return this.gamesService.findPublic(query);
  }
}
