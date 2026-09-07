import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SteamClient } from './steam.client.js';
import { SteamService } from './steam.service.js';
import { SteamController } from './steam.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [SteamController],
  providers: [SteamClient, SteamService],
  exports: [SteamService],
})
export class SteamModule {}
