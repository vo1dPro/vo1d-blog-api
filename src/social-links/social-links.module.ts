import { MediaModule } from '../media/media.module.js';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AdminSocialLinksController } from './admin-social-links.controller.js';
import { SocialLinksController } from './social-links.controller.js';
import { SocialLinksService } from './social-links.service.js';

@Module({
  imports: [AuthModule, MediaModule],
  controllers: [SocialLinksController, AdminSocialLinksController],
  providers: [SocialLinksService],
  exports: [SocialLinksService],
})
export class SocialLinksModule {}
