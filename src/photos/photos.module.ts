import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AdminPhotosController } from './admin-photos.controller.js';
import { PhotosController } from './photos.controller.js';
import { PhotosService } from './photos.service.js';

@Module({
  imports: [AuthModule],
  controllers: [PhotosController, AdminPhotosController],
  providers: [PhotosService],
  exports: [PhotosService],
})
export class PhotosModule {}
