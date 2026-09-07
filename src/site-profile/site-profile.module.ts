import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MediaModule } from '../media/media.module.js';
import { AdminSiteProfileController } from './admin-site-profile.controller.js';
import { SiteProfileController } from './site-profile.controller.js';
import { SiteProfileService } from './site-profile.service.js';

@Module({
  imports: [AuthModule, MediaModule],
  controllers: [SiteProfileController, AdminSiteProfileController],
  providers: [SiteProfileService],
})
export class SiteProfileModule {}
