import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MediaModule } from '../media/media.module.js';
import { AdminArticlesController } from './admin-articles.controller.js';
import { ArticlesController } from './articles.controller.js';
import { ArticlesService } from './articles.service.js';
import { MarkdownService } from './markdown.service.js';

@Module({
  imports: [AuthModule, MediaModule],
  controllers: [ArticlesController, AdminArticlesController],
  providers: [ArticlesService, MarkdownService],
  exports: [ArticlesService, MarkdownService],
})
export class ArticlesModule {}
