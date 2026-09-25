import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/auth/auth.decorators.js';
import { SettingsService } from './settings.service.js';

/**
 * Settings the app shows before sign-in (K2-K4): the texts use these values instead of
 * hard-coded numbers (CLAUDE.md rule 7). Money is a tiyin string.
 */
@Public()
@Controller('config')
export class PublicConfigController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  async config() {
    const s = await this.settings.getAll();
    return {
      referral_required: s.referral_required,
      free_period_days: s.free_period_days,
      demo_bonus: s.demo_bonus.toString(),
      min_age_years: s.min_age_years,
      otp_length: s.otp_length,
      payment_methods_enabled: s.payment_methods_enabled,
    };
  }
}
