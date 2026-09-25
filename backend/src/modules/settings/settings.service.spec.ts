import { settingsDefaults } from '../../../prisma/seed/settings.defaults.js';
import { AppError } from '../../common/errors/app-error.js';
import { SETTING_KEYS } from './settings.schema.js';
import { parseSettings } from './settings.service.js';

const rowsFrom = (values: Record<string, unknown>) =>
  Object.entries(values).map(([key, value]) => ({ key, value }));

describe('settings seed defaults (docs/01-biznes-qoidalar.md §12)', () => {
  it('cover every setting key and nothing else', () => {
    expect(Object.keys(settingsDefaults).sort()).toEqual([...SETTING_KEYS].sort());
  });

  it('parse, with money as bigint tiyin', () => {
    const settings = parseSettings(rowsFrom(settingsDefaults));

    // Standard rates used by the §11 test cases.
    expect(settings.fee_bps).toBe(250);
    expect(settings.ref_l1_bps).toBe(25);
    expect(settings.ref_l2_bps).toBe(12);
    expect(settings.withdraw_fee_bps).toBe(100);
    expect(settings.accept_threshold_bps).toBe(250);
    expect(settings.topup_min).toBe(100_000n); // 1 000 so'm
    expect(settings.demo_bonus).toBe(2_500_000n); // 25 000 so'm
  });

  it('include the limits that §3, §8 and §10 mention outside the §12 table', () => {
    expect(parseSettings(rowsFrom(settingsDefaults))).toMatchObject({
      free_period_reminder_days: [7, 3, 1],
      otp_phone_limit: 3,
      otp_limit_window_sec: 600,
      order_photos_max: 5,
      upload_max_mb: 5,
      route_deviation_m: 300,
    });
  });
});

describe('parseSettings', () => {
  const expectInvalid = (values: Record<string, unknown>, keys: string) => {
    try {
      parseSettings(rowsFrom(values));
      expect.unreachable('parseSettings should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({ code: 'SETTINGS_INVALID', params: { keys } });
    }
  };

  it('refuses a missing key instead of falling back to a default', () => {
    const { fee_bps: _removed, ...rest } = settingsDefaults;
    expectInvalid(rest, 'fee_bps');
  });

  it('refuses fractional rates and money that is not integer tiyin', () => {
    expectInvalid({ ...settingsDefaults, fee_bps: 2.5 }, 'fee_bps');
    expectInvalid({ ...settingsDefaults, topup_min: 1000.5 }, 'topup_min');
    expectInvalid({ ...settingsDefaults, topup_min: '1000.50' }, 'topup_min');
  });

  it('refuses referral shares larger than the fee', () => {
    expectInvalid({ ...settingsDefaults, ref_l1_bps: 200, ref_l2_bps: 100 }, 'ref_l1_bps');
  });

  it('ignores unknown keys left in the table', () => {
    expect(() => parseSettings(rowsFrom({ ...settingsDefaults, legacy_key: 1 }))).not.toThrow();
  });
});
