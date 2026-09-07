import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { OriginGuard } from './common/guards/origin.guard.js';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter.js';
import { PublicCacheInterceptor } from './common/interceptors/public-cache.interceptor.js';
import { AuthModule } from './auth/auth.module.js';
import { MediaModule } from './media/media.module.js';
import { HealthModule } from './health/health.module.js';
import { SiteProfileModule } from './site-profile/site-profile.module.js';
import { ArticlesModule } from './articles/articles.module.js';
import { CategoriesModule } from './categories/categories.module.js';
import { TagsModule } from './tags/tags.module.js';
import { BooksModule } from './books/books.module.js';
import { GamesModule } from './games/games.module.js';
import { PhotosModule } from './photos/photos.module.js';
import { SkillsModule } from './skills/skills.module.js';
import { SocialLinksModule } from './social-links/social-links.module.js';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    AuthModule,
    MediaModule,
    SiteProfileModule,
    HealthModule,
    ArticlesModule,
    CategoriesModule,
    TagsModule,
    BooksModule,
    GamesModule,
    PhotosModule,
    SkillsModule,
    SocialLinksModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: PublicCacheInterceptor },
  ],
})
export class AppModule {}
