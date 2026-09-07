import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AuthModule } from '../auth/auth.module.js';
import { AppConfigService } from '../config/app-config.service.js';
import { AdminMediaController } from './admin-media.controller.js';
import { MediaService } from './media.service.js';
import { StorageService } from './storage.service.js';

@Module({
  imports: [
    AuthModule,
    MulterModule.registerAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        storage: memoryStorage(),
        limits: { fileSize: config.mediaMaxUploadBytes, files: 1 },
      }),
    }),
  ],
  controllers: [AdminMediaController],
  providers: [MediaService, StorageService],
  exports: [MediaService, StorageService],
})
export class MediaModule {}
