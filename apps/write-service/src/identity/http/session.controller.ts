import { Body, Controller, Delete, HttpCode, Post, Req, Res, UseFilters } from '@nestjs/common';
import { LoginRequestSchema, type LoginRequest, type SessionResponse } from '@stubb/contracts';
import type { Request, Response } from 'express';
import { Public } from '../../auth/decorators.js';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe.js';
import { SessionService } from '../application/session.service.js';
import { IdentityError } from '../identity.errors.js';
import { IdentityErrorFilter } from './identity-error.filter.js';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from './refresh-cookie.js';

@Public()
@Controller('identity/session')
@UseFilters(IdentityErrorFilter)
export class SessionController {
  constructor(private readonly sessions: SessionService) {}

  @Post()
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(LoginRequestSchema)) body: LoginRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    const { session, refreshToken } = await this.sessions.login(body);
    setRefreshCookie(res, refreshToken);
    return session;
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    try {
      const { session, refreshToken } = await this.sessions.refresh(readRefreshCookie(req));
      setRefreshCookie(res, refreshToken);
      return session;
    } catch (error) {
      if (error instanceof IdentityError) clearRefreshCookie(res);
      throw error;
    }
  }

  @Delete()
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.sessions.logout(readRefreshCookie(req));
    clearRefreshCookie(res);
  }
}
