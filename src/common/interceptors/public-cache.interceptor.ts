import { createHash } from 'node:crypto';
import { CallHandler, ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { map, type Observable } from 'rxjs';

@Injectable()
export class PublicCacheInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    // Binary responses provide their own content hash and cache headers.
    if (/^\/media\/\d+\/content\/?$/.test(request.path)) return next.handle();
    const isPublicGet =
      request.method === 'GET' &&
      request.path.startsWith('/') &&
      !request.path.startsWith('/admin') &&
      !request.path.startsWith('/auth');

    if (!isPublicGet || request.path === '/health' || /^\/(?:games\/playing|creations(?:\/layout)?)\/?$/.test(request.path)) {
      response.setHeader('Cache-Control', 'no-store');
      return next.handle();
    }

    return next.handle().pipe(
      map((body: unknown) => {
        const serialized = JSON.stringify(body);
        const etag = `"${createHash('sha256').update(serialized).digest('base64url')}"`;
        response.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
        response.setHeader('ETag', etag);
        if (request.get('if-none-match') === etag) {
          response.status(304);
          return undefined;
        }
        return body;
      }),
    );
  }
}
