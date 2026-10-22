import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CreationsController, AdminCreationsController } from './creations.controller.js';
import { CreationsService } from './creations.service.js';

@Module({
  imports: [AuthModule],
  controllers: [CreationsController, AdminCreationsController],
  providers: [CreationsService],
})
export class CreationsModule {}
