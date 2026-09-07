import { createHash, createHmac, randomBytes } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import type { Request } from 'express';
import { AppConfigService } from '../config/app-config.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { LoginRateLimitService } from './login-rate-limit.service.js';
import type { AuthenticatedAdmin, SessionAuthentication } from './auth.types.js';

@Injectable()
export class AuthService {
  private readonly dummyHash: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly loginRateLimit: LoginRateLimitService,
  ) {
    this.dummyHash = argon2.hash(randomBytes(32), { type: argon2.argon2id });
  }

  normalizeEmail(email: string): string {
    return email.trim().toLocaleLowerCase('en-US');
  }

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  hashIp(ipAddress: string): string {
    return createHmac('sha256', this.config.ipHashSecret).update(ipAddress).digest('hex');
  }

  async login(
    emailInput: string,
    password: string,
    request: Request,
  ): Promise<{ admin: AuthenticatedAdmin; token: string; expiresAt: Date }> {
    const email = this.normalizeEmail(emailInput);
    const ipAddress = request.ip ?? request.socket.remoteAddress ?? 'unknown';
    await this.loginRateLimit.consume(email, ipAddress);

    const user = await this.prisma.adminUser.findUnique({ where: { email } });
    const passwordHash = user?.passwordHash ?? (await this.dummyHash);
    const isPasswordValid = await argon2.verify(passwordHash, password);

    if (user === null || !isPasswordValid || !user.isActive) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const token = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(token);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.config.sessionTtlMs);
    const userAgentHeader = request.get('user-agent');

    await this.prisma.$transaction([
      this.prisma.adminSession.create({
        data: {
          adminUserId: user.id,
          tokenHash,
          expiresAt,
          lastUsedAt: now,
          ipHash: this.hashIp(ipAddress),
          ...(userAgentHeader === undefined ? {} : { userAgent: userAgentHeader.slice(0, 1000) }),
        },
      }),
      this.prisma.adminUser.update({
        where: { id: user.id },
        data: { lastLoginAt: now },
      }),
    ]);

    return { admin: { id: user.id, email: user.email }, token, expiresAt };
  }

  async authenticate(token: string | undefined): Promise<SessionAuthentication> {
    if (token === undefined || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
      throw new UnauthorizedException('Authentication required');
    }

    const tokenHash = this.hashToken(token);
    const session = await this.prisma.adminSession.findUnique({
      where: { tokenHash },
      include: { adminUser: true },
    });
    const now = new Date();
    if (
      session === null ||
      session.expiresAt.getTime() <= now.getTime() ||
      !session.adminUser.isActive
    ) {
      if (session !== null) {
        await this.prisma.adminSession.deleteMany({ where: { id: session.id } });
      }
      throw new UnauthorizedException('Session is invalid or expired');
    }

    if (now.getTime() - session.lastUsedAt.getTime() >= this.config.sessionTouchIntervalMs) {
      await this.prisma.adminSession.update({
        where: { id: session.id },
        data: { lastUsedAt: now },
      });
    }

    return {
      admin: { id: session.adminUser.id, email: session.adminUser.email },
      tokenHash,
    };
  }

  async logout(tokenHash: string): Promise<void> {
    await this.prisma.adminSession.deleteMany({ where: { tokenHash } });
  }
}
