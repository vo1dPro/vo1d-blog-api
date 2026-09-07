import 'reflect-metadata';
import { json, urlencoded, type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import { ForbiddenException, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { AppConfigService } from './config/app-config.service.js';

export async function createApp(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  const config = app.get(AppConfigService);
  app.set('trust proxy', config.trustProxy ? 1 : false);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use((request: Request, response: Response, next: NextFunction) => {
    response.setHeader('Cache-Control', 'no-store');
    if (request.path.startsWith('/auth') || request.path.startsWith('/admin')) {
      response.setHeader('Pragma', 'no-cache');
    }
    next();
  });
  app.use(json({ limit: config.bodyLimit }));
  app.use(urlencoded({ extended: false, limit: config.bodyLimit }));
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allowed?: boolean) => void,
    ) => {
      if (origin === undefined || config.frontendOrigins.includes(origin)) callback(null, true);
      else callback(new ForbiddenException('CORS origin is not allowed'), false);
    },
    credentials: true,
    exposedHeaders: ['ETag', 'Retry-After'],
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  app.enableShutdownHooks();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  const swaggerConfig = new DocumentBuilder()
    .setTitle('vo1d-blog API')
    .setDescription(
      'Public content and database-session administration. Writes require an allowed Origin. Login sets an HttpOnly cookie; use credentials: include.',
    )
    .setVersion('')
    .addCookieAuth(
      config.sessionCookieName,
      {
        type: 'apiKey',
        in: 'cookie',
        description: 'HttpOnly cookie set by POST /auth/login',
      },
      'cookie',
    )
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs-json',
    swaggerOptions: { persistAuthorization: false, withCredentials: true },
  });
  await app.init();
  return app;
}
