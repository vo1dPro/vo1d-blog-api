import { createHmac } from 'node:crypto';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service.js';
import { PrismaService } from '../database/prisma.service.js';

@Injectable()
export class LoginRateLimitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async consume(email: string, ipAddress: string): Promise<void> {
    const now = new Date();
    const limits = this.config.loginRateLimit;
    for (const identity of [`ip:${ipAddress}`, `email:${email}`]) {
      const keyHash = createHmac('sha256', this.config.ipHashSecret).update(identity).digest('hex');
      const cutoff = new Date(now.getTime() - limits.windowMs);
      const blockEnd = new Date(now.getTime() + limits.blockMs);
      // Atomic UPSERT: PostgreSQL serializes concurrent increments on this bucket.
      const rows = await this.prisma.$queryRaw<
        { attemptCount: number; blockedUntil: Date | null }[]
      >`
        INSERT INTO login_throttles ("keyHash", "attemptCount", "windowStart", "blockedUntil", "updatedAt")
        VALUES (${keyHash}, 1, ${now}, NULL, ${now})
        ON CONFLICT ("keyHash") DO UPDATE SET
          "attemptCount" = CASE
            WHEN login_throttles."blockedUntil" > ${now} THEN login_throttles."attemptCount"
            WHEN login_throttles."windowStart" <= ${cutoff} THEN 1
            ELSE login_throttles."attemptCount" + 1 END,
          "windowStart" = CASE
            WHEN login_throttles."blockedUntil" > ${now} THEN login_throttles."windowStart"
            WHEN login_throttles."windowStart" <= ${cutoff} THEN ${now}
            ELSE login_throttles."windowStart" END,
          "blockedUntil" = CASE
            WHEN login_throttles."blockedUntil" > ${now} THEN login_throttles."blockedUntil"
            WHEN login_throttles."windowStart" <= ${cutoff} THEN NULL
            WHEN login_throttles."attemptCount" + 1 > ${limits.max} THEN ${blockEnd}
            ELSE NULL END,
          "updatedAt" = ${now}
        RETURNING "attemptCount", "blockedUntil"
      `;
      const record = rows[0];
      if (record?.blockedUntil && record.blockedUntil > now) {
        throw new HttpException(
          {
            statusCode: 429,
            message: 'Too many login attempts',
            retryAfter: Math.max(
              1,
              Math.ceil((record.blockedUntil.getTime() - now.getTime()) / 1000),
            ),
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
  }
}
