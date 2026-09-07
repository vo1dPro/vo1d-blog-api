import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AdminTagsController } from './admin-tags.controller.js';
import { TagsController } from './tags.controller.js';
import { TagsService } from './tags.service.js';

@Module({
  imports: [AuthModule],
  controllers: [TagsController, AdminTagsController],
  providers: [TagsService],
  exports: [TagsService],
})
export class TagsModule {}
