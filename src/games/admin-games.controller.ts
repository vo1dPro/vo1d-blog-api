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
import { CreateGameDto } from './dto/create-game.dto.js';
import { GamePageResponseDto, GameResponseDto } from './dto/game-response.dto.js';
import { UpdateGameDto } from './dto/update-game.dto.js';
import { GamesService } from './games.service.js';

@ApiTags('admin/games')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'A valid administrator session is required' })
@UseGuards(SessionAuthGuard)
@Controller({ path: 'admin/games' })
export class AdminGamesController {
  constructor(private readonly gamesService: GamesService) {}

  @Get()
  @ApiOperation({ summary: 'List all games, including hidden records' })
  @ApiOkResponse({ type: GamePageResponseDto })
  findAll(@Query() query: PaginationQueryDto): Promise<GamePageResponseDto> {
    return this.gamesService.findAllAdmin(query);
  }

  @Patch('reorder')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Atomically update game display positions' })
  @ApiNoContentResponse({ description: 'Game display positions updated' })
  @ApiBadRequestResponse({ description: 'Duplicate IDs or display positions' })
  @ApiNotFoundResponse({ description: 'At least one game does not exist' })
  reorder(@Body() body: ReorderDto): Promise<void> {
    return this.gamesService.reorder(body);
  }

  @Post()
  @ApiOperation({ summary: 'Create a game' })
  @ApiCreatedResponse({ type: GameResponseDto })
  @ApiBadRequestResponse({ description: 'Input or cover media kind is invalid' })
  @ApiNotFoundResponse({ description: 'Cover media asset not found' })
  create(@Body() body: CreateGameDto): Promise<GameResponseDto> {
    return this.gamesService.create(body);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one game for administration' })
  @ApiOkResponse({ type: GameResponseDto })
  @ApiNotFoundResponse({ description: 'Game not found' })
  findOne(@Param() params: IdParamDto): Promise<GameResponseDto> {
    return this.gamesService.findOneAdmin(params.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a game' })
  @ApiOkResponse({ type: GameResponseDto })
  @ApiBadRequestResponse({ description: 'Input or cover media kind is invalid' })
  @ApiNotFoundResponse({ description: 'Game or cover media asset not found' })
  update(@Param() params: IdParamDto, @Body() body: UpdateGameDto): Promise<GameResponseDto> {
    return this.gamesService.update(params.id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a game' })
  @ApiNoContentResponse({ description: 'Game deleted' })
  @ApiNotFoundResponse({ description: 'Game not found' })
  remove(@Param() params: IdParamDto): Promise<void> {
    return this.gamesService.remove(params.id);
  }
}
