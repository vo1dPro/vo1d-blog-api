import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SteamClient } from './steam.client.js';
import { SteamService } from './steam.service.js';
import { SteamController } from './steam.controller.js';
import { SteamPresenceService } from './steam-presence.service.js';

@Module({
  imports: [AuthModule],
  controllers: [SteamController],
  providers: [SteamClient, SteamService, SteamPresenceService],
  exports: [SteamService, SteamPresenceService],
})
export class SteamModule {}
