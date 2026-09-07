import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CurrentAdmin } from '../common/decorators/current-admin.decorator.js';
import { AppConfigService } from '../config/app-config.service.js';
import { AuthService } from './auth.service.js';
import type { AuthenticatedAdmin } from './auth.types.js';
import { LoginDto } from './dto/login.dto.js';
import { SessionAuthGuard } from './session-auth.guard.js';
import { AdminIdentityDto, LoginResponseDto } from '../common/dto/api-response.dto.js';

@ApiTags('auth')
@Controller({ path: 'auth' })
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: AppConfigService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create an administrator database session' })
  @ApiOkResponse({ type: LoginResponseDto, description: 'HttpOnly cookie set' })
  @ApiUnauthorizedResponse({ description: 'Credentials are invalid' })
  async login(
    @Body() body: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ admin: AuthenticatedAdmin; expiresAt: string }> {
    const result = await this.authService.login(body.email, body.password, request);
    response.cookie(this.config.sessionCookieName, result.token, {
      httpOnly: true,
      secure: this.config.isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: this.config.sessionTtlMs,
    });
    response.setHeader('Cache-Control', 'no-store');
    return { admin: result.admin, expiresAt: result.expiresAt.toISOString() };
  }

  @Post('logout')
  @UseGuards(SessionAuthGuard)
  @ApiCookieAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Session deleted and cookie cleared' })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    if (request.sessionTokenHash === undefined) {
      throw new Error('SessionAuthGuard did not attach a session token hash');
    }
    await this.authService.logout(request.sessionTokenHash);
    response.clearCookie(this.config.sessionCookieName, {
      httpOnly: true,
      secure: this.config.isProduction,
      sameSite: 'lax',
      path: '/',
    });
    response.setHeader('Cache-Control', 'no-store');
  }

  @Get('me')
  @UseGuards(SessionAuthGuard)
  @ApiCookieAuth()
  @ApiOkResponse({ type: AdminIdentityDto })
  me(@CurrentAdmin() admin: AuthenticatedAdmin): AuthenticatedAdmin {
    return admin;
  }
}
