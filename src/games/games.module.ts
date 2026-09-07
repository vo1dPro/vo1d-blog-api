import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AdminGamesController } from './admin-games.controller.js';
import { GamesController } from './games.controller.js';
import { GamesService } from './games.service.js';
import { SteamModule } from '../steam/steam.module.js';

@Module({
  imports: [AuthModule, SteamModule],
  controllers: [GamesController, AdminGamesController],
  providers: [GamesService],
  exports: [GamesService],
})
export class GamesModule {}
