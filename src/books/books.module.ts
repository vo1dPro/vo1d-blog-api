import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MediaModule } from '../media/media.module.js';
import { AdminBooksController } from './admin-books.controller.js';
import { BooksController } from './books.controller.js';
import { BooksService } from './books.service.js';

@Module({
  imports: [AuthModule, MediaModule],
  controllers: [BooksController, AdminBooksController],
  providers: [BooksService],
  exports: [BooksService],
})
export class BooksModule {}
