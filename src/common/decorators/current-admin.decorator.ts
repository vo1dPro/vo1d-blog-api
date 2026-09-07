import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedAdmin } from '../../auth/auth.types.js';

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedAdmin => {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.admin === undefined) {
      throw new Error('CurrentAdmin used without SessionAuthGuard');
    }
    return request.admin;
  },
);
