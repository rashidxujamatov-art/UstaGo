import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { Auth, type AuthContext, ClientIp, Public } from '../../common/auth/auth.decorators.js';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { RateLimiter } from '../../common/rate-limit/rate-limiter.service.js';
import { ZodPipe } from '../../common/validation/zod-body.pipe.js';
import { ReferralsService } from '../referrals/referrals.service.js';
import { SettingsService } from '../settings/settings.service.js';
import {
  loginSchema,
  passwordResetConfirmSchema,
  passwordResetSchema,
  refreshSchema,
  registerSchema,
  resendOtpSchema,
  verifyOtpSchema,
} from './auth.schemas.js';
import type { z } from 'zod';
import { AuthService } from './auth.service.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly referrals: ReferralsService,
    private readonly settings: SettingsService,
    private readonly rateLimiter: RateLimiter,
  ) {}

  /** K2 banner: "Sizni {ism} taklif qildi". A platform code has no inviter. */
  @Public()
  @Get('invite/:code')
  async invite(@Param('code') code: string, @ClientIp() ip: string) {
    const s = await this.settings.getAll();
    await this.rateLimiter.hit({
      key: `invite:ip:${ip}`,
      limit: s.otp_ip_limit,
      windowSec: s.otp_limit_window_sec,
    });
    if (code.length > 32) throw new AppError(ErrorCode.AUTH_REFERRAL_INVALID);

    const invite = await this.referrals.resolve(code);
    return invite.kind === 'USER'
      ? {
          kind: invite.kind,
          inviter: { first_name: invite.inviter.firstName, last_name: invite.inviter.lastName },
        }
      : { kind: invite.kind, inviter: null };
  }

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.ACCEPTED)
  register(
    @Body(new ZodPipe(registerSchema)) body: z.output<typeof registerSchema>,
    @ClientIp() ip: string,
  ) {
    return this.auth.register(body, ip);
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  verifyOtp(@Body(new ZodPipe(verifyOtpSchema)) body: z.output<typeof verifyOtpSchema>) {
    return body.purpose === 'REGISTER'
      ? this.auth.verifyRegistration(body)
      : this.auth.verifyLogin(body);
  }

  @Public()
  @Post('otp/resend')
  @HttpCode(HttpStatus.OK)
  resendOtp(
    @Body(new ZodPipe(resendOtpSchema)) body: z.output<typeof resendOtpSchema>,
    @ClientIp() ip: string,
  ) {
    return this.auth.resendOtp(body, ip);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(
    @Body(new ZodPipe(loginSchema)) body: z.output<typeof loginSchema>,
    @ClientIp() ip: string,
  ) {
    return this.auth.login(body, ip);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body(new ZodPipe(refreshSchema)) body: z.output<typeof refreshSchema>) {
    return this.auth.refresh(body.refresh_token);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Auth() auth: AuthContext) {
    return this.auth.logout(auth.sessionId);
  }

  @Public()
  @Post('password/reset')
  @HttpCode(HttpStatus.ACCEPTED)
  requestPasswordReset(
    @Body(new ZodPipe(passwordResetSchema)) body: z.output<typeof passwordResetSchema>,
    @ClientIp() ip: string,
  ) {
    return this.auth.requestPasswordReset(body.phone, body.lang, ip);
  }

  @Public()
  @Post('password/reset/confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  confirmPasswordReset(
    @Body(new ZodPipe(passwordResetConfirmSchema))
    body: z.output<typeof passwordResetConfirmSchema>,
  ) {
    return this.auth.confirmPasswordReset(body.phone, body.code, body.new_password);
  }
}
