import { Body, Controller, Get, Put } from '@nestjs/common';
import { z } from 'zod';
import { Auth, type AuthContext } from '../../common/auth/auth.decorators.js';
import { RequireStaff } from '../../common/auth/staff.guard.js';
import { ZodPipe } from '../../common/validation/zod-body.pipe.js';
import { SettingsService } from './settings.service.js';

/** Structural check only — `SettingsService.update()` re-validates every key's real shape
 * plus the cross-field rate rule, since a partial patch still needs the whole merged object. */
const patchSchema = z
  .record(z.string(), z.unknown())
  .refine((value) => Object.keys(value).length > 0, 'at least one setting is required');

/** SA2 groups (docs/03 §3.6). `tax_methods_enabled` (SA5) and the trip/map settings (SA6)
 * are read/written through their own existing endpoints, not repeated here — see the stage 7
 * contract §8. */
const GROUPS: Record<string, readonly string[]> = {
  rates: [
    'fee_bps',
    'ref_l1_bps',
    'ref_l2_bps',
    'accept_threshold_bps',
    'withdraw_fee_bps',
    'dispute_partial_bps',
  ],
  free_period: ['free_period_days', 'free_period_reminder_days', 'demo_bonus'],
  wallet: ['topup_min'],
  payments: ['payment_methods_enabled', 'qr_payment_ttl_sec'],
  referrals: ['referral_required', 'ref_on_demo_fee'],
  confirmations: ['confirm_reminder_hours', 'confirm_admin_task_hours'],
  moderation: ['broadcast_min_interval_sec'],
};
const OWNED_ELSEWHERE = new Set([
  'tax_methods_enabled',
  'location_interval_sec',
  'eta_refresh_sec',
  'route_deviation_m',
  'auto_stop_radius_m',
  'max_trip_minutes',
  'track_retention_days',
  'self_employed_reminder_days',
]);
const GROUPED_KEYS = new Set(Object.values(GROUPS).flat());

/** SA2 "Komissiya va to'lovlar" (super admin only, stage 7). */
@Controller('sa/settings')
@RequireStaff('SUPER_ADMIN')
export class SaSettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  async get() {
    return grouped(await this.settings.getAll());
  }

  @Put()
  async update(
    @Auth() auth: AuthContext,
    @Body(new ZodPipe(patchSchema)) body: z.output<typeof patchSchema>,
  ) {
    return grouped(await this.settings.update(auth.userId, body));
  }
}

function grouped(all: Record<string, unknown>): Record<string, Record<string, unknown>> {
  const wire = Object.fromEntries(Object.entries(all).map(([key, value]) => [key, toWire(value)]));
  const result: Record<string, Record<string, unknown>> = {};
  for (const [group, keys] of Object.entries(GROUPS)) {
    result[group] = Object.fromEntries(keys.map((key) => [key, wire[key]]));
  }
  const other: Record<string, unknown> = {};
  for (const key of Object.keys(wire)) {
    if (!GROUPED_KEYS.has(key) && !OWNED_ELSEWHERE.has(key)) other[key] = wire[key];
  }
  return { ...result, other };
}

/** Bigint money fields become tiyin strings on the wire; everything else is unchanged. */
function toWire(value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}
