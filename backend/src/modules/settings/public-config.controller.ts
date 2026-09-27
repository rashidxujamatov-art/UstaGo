import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/auth/auth.decorators.js';
import { SettingsService } from './settings.service.js';

/**
 * Settings the app shows in its texts and forms (K2-K4, BY2, BJ1) instead of hard-coded
 * numbers (CLAUDE.md rule 7). Money is a tiyin string.
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
      order_photos_max: s.order_photos_max,
      feed_nearby_radius_m: s.feed_nearby_radius_m,
      topup_min: s.topup_min.toString(),
      fee_bps: s.fee_bps,
      tax_methods_enabled: s.tax_methods_enabled,
      withdraw_fee_bps: s.withdraw_fee_bps,
    };
  }
}
