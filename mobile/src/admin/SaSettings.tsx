import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Switch, View } from 'react-native';
import { endpoints } from '../api/endpoints';
import { queryKeys, useSaSettings, useTaxMethodsOverview } from '../api/queries';
import type { PaymentMethod, SaSettingsUpdate } from '../api/types';
import { useErrorText } from '../api/use-error-text';
import { ApiError } from '../api/client';
import { AppText } from '../components/AppText';
import { BarHeader, BarIconButton } from '../components/ui/BarHeader';
import { BoxField } from '../components/ui/BoxField';
import { Card, Separator } from '../components/ui/Card';
import { showNotice } from '../lib/notice';
import { priceDigits, somDigitsToTiyin } from '../lib/input';
import { invalidFieldSet, parsePercentToBps, parsePositiveInt } from './settings-input';
import { OrderPlaceholder } from '../orders/OrderParts';
import { useTheme } from '../theme/ThemeProvider';

const PAYMENT_METHODS: PaymentMethod[] = ['BALANCE', 'CLICK', 'PAYME', 'CARD', 'CASH', 'XOLIS_QR'];
/** Percent fields allow one decimal separator (bps has 2 fraction digits, docs §15). */
const percentMask = (text: string) => text.replace(/[^0-9.,]/g, '');

interface FormValues {
  fee_bps: string;
  ref_l1_bps: string;
  ref_l2_bps: string;
  accept_threshold_bps: string;
  withdraw_fee_bps: string;
  dispute_partial_bps: string;
  free_period_days: string;
  free_period_reminder_days: string;
  demo_bonus: string;
  topup_min: string;
  payment_methods_enabled: PaymentMethod[];
  qr_payment_ttl_sec: string;
  referral_required: boolean;
  ref_on_demo_fee: boolean;
  confirm_reminder_hours: string;
  confirm_admin_task_hours: string;
  broadcast_min_interval_sec: string;
}

type StringFieldKey = Exclude<
  keyof FormValues,
  'payment_methods_enabled' | 'referral_required' | 'ref_on_demo_fee'
>;

function toFormValues(data: NonNullable<ReturnType<typeof useSaSettings>['data']>): FormValues {
  return {
    fee_bps: String(data.rates.fee_bps),
    ref_l1_bps: String(data.rates.ref_l1_bps),
    ref_l2_bps: String(data.rates.ref_l2_bps),
    accept_threshold_bps: String(data.rates.accept_threshold_bps),
    withdraw_fee_bps: String(data.rates.withdraw_fee_bps),
    dispute_partial_bps: String(data.rates.dispute_partial_bps),
    free_period_days: String(data.free_period.free_period_days),
    free_period_reminder_days: String(data.free_period.free_period_reminder_days),
    demo_bonus: (BigInt(data.free_period.demo_bonus) / 100n).toString(),
    topup_min: (BigInt(data.wallet.topup_min) / 100n).toString(),
    payment_methods_enabled: data.payments.payment_methods_enabled,
    qr_payment_ttl_sec: String(data.payments.qr_payment_ttl_sec),
    referral_required: data.referrals.referral_required,
    ref_on_demo_fee: data.referrals.ref_on_demo_fee,
    confirm_reminder_hours: String(data.confirmations.confirm_reminder_hours),
    confirm_admin_task_hours: String(data.confirmations.confirm_admin_task_hours),
    broadcast_min_interval_sec: String(data.moderation.broadcast_min_interval_sec),
  };
}

/** SA2 "Komissiya va to'lovlar": every setting, grouped as the design lays them out. */
export function SaSettings() {
  const theme = useTheme();
  const { t } = useTranslation();
  const errorText = useErrorText();
  const client = useQueryClient();
  const overview = useSaSettings();
  const taxMethods = useTaxMethodsOverview();
  const [values, setValues] = useState<FormValues | null>(null);
  const [invalid, setInvalid] = useState<ReadonlySet<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // Seeds the editable fields once, same pattern as MapsSettings.tsx.
  if (overview.data && values === null) {
    setValues(toFormValues(overview.data));
  }

  if (!overview.data || values === null) {
    return (
      <OrderPlaceholder
        error={overview.isError ? errorText(overview.error) : null}
        onRetry={() => void overview.refetch()}
      />
    );
  }
  const dirty = JSON.stringify(values) !== JSON.stringify(toFormValues(overview.data));
  const field =
    (key: StringFieldKey, mask: (text: string) => string = (text) => text.replace(/[^0-9]/g, '')) =>
    (text: string) =>
      setValues((prev) => (prev ? { ...prev, [key]: mask(text) } : prev));
  const toggle = (key: 'payment_methods_enabled', method: PaymentMethod) =>
    setValues((prev) => {
      if (!prev) return prev;
      const enabled = prev[key].includes(method)
        ? prev[key].filter((item) => item !== method)
        : [...prev[key], method];
      return { ...prev, [key]: enabled };
    });

  const save = async () => {
    const percent = (text: string) => parsePercentToBps(text);
    const int = (text: string) => parsePositiveInt(text);
    const money = (text: string) => somDigitsToTiyin(text);
    const feeBps = percent(values.fee_bps);
    const l1Bps = percent(values.ref_l1_bps);
    const l2Bps = percent(values.ref_l2_bps);
    const acceptBps = percent(values.accept_threshold_bps);
    const withdrawBps = percent(values.withdraw_fee_bps);
    const disputeBps = percent(values.dispute_partial_bps);
    const freeDays = int(values.free_period_days);
    const reminderDays = int(values.free_period_reminder_days);
    const demoBonus = money(values.demo_bonus);
    const topupMin = money(values.topup_min);
    const qrTtl = int(values.qr_payment_ttl_sec);
    const confirmReminder = int(values.confirm_reminder_hours);
    const confirmAdmin = int(values.confirm_admin_task_hours);
    const broadcastInterval = int(values.broadcast_min_interval_sec);

    if (
      feeBps === null ||
      l1Bps === null ||
      l2Bps === null ||
      acceptBps === null ||
      withdrawBps === null ||
      disputeBps === null ||
      freeDays === null ||
      reminderDays === null ||
      demoBonus === null ||
      topupMin === null ||
      qrTtl === null ||
      confirmReminder === null ||
      confirmAdmin === null ||
      broadcastInterval === null
    ) {
      showNotice(t('sa.settingsFieldInvalid'));
      return;
    }

    const input: SaSettingsUpdate = {
      fee_bps: feeBps,
      ref_l1_bps: l1Bps,
      ref_l2_bps: l2Bps,
      accept_threshold_bps: acceptBps,
      withdraw_fee_bps: withdrawBps,
      dispute_partial_bps: disputeBps,
      free_period_days: freeDays,
      free_period_reminder_days: reminderDays,
      demo_bonus: demoBonus,
      topup_min: topupMin,
      payment_methods_enabled: values.payment_methods_enabled,
      qr_payment_ttl_sec: qrTtl,
      referral_required: values.referral_required,
      ref_on_demo_fee: values.ref_on_demo_fee,
      confirm_reminder_hours: confirmReminder,
      confirm_admin_task_hours: confirmAdmin,
      broadcast_min_interval_sec: broadcastInterval,
    };

    setSaving(true);
    setInvalid(new Set());
    try {
      const updated = await endpoints.updateSaSettings(input);
      client.setQueryData(queryKeys.saSettings, updated);
      setValues(toFormValues(updated));
      showNotice(t('sa.settingsSaved'));
    } catch (error) {
      if (error instanceof ApiError && error.code === 'VALIDATION_FAILED') {
        setInvalid(invalidFieldSet(error.params.fields));
      }
      showNotice(errorText(error));
    } finally {
      setSaving(false);
    }
  };

  const fieldError = (key: string) => (invalid.has(key) ? t('sa.settingsFieldInvalid') : undefined);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg2 }}>
      <BarHeader
        title={t('sa.settingsTitle')}
        right={
          dirty && !saving ? (
            <BarIconButton icon={Check} label={t('sa.settingsSave')} onPress={() => void save()} />
          ) : undefined
        }
      />
      <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}>
        <Card title={t('sa.settingsRatesSection')}>
          <PercentField
            label={t('sa.settingsFeeLabel')}
            hint={t('sa.settingsFeeHint')}
            value={values.fee_bps}
            onChangeText={field('fee_bps', percentMask)}
            error={fieldError('fee_bps')}
          />
          <PercentField
            label={t('sa.settingsRefL1Label')}
            hint={t('sa.settingsRefL1Hint')}
            value={values.ref_l1_bps}
            onChangeText={field('ref_l1_bps', percentMask)}
            error={fieldError('ref_l1_bps')}
          />
          <PercentField
            label={t('sa.settingsRefL2Label')}
            hint={t('sa.settingsRefL2Hint')}
            value={values.ref_l2_bps}
            onChangeText={field('ref_l2_bps', percentMask)}
            error={fieldError('ref_l2_bps')}
          />
          <PercentField
            label={t('sa.settingsAcceptThresholdLabel')}
            hint={t('sa.settingsAcceptThresholdHint')}
            value={values.accept_threshold_bps}
            onChangeText={field('accept_threshold_bps', percentMask)}
            error={fieldError('accept_threshold_bps')}
          />
          <PercentField
            label={t('sa.settingsWithdrawFeeLabel')}
            hint={t('sa.settingsWithdrawFeeHint')}
            value={values.withdraw_fee_bps}
            onChangeText={field('withdraw_fee_bps', percentMask)}
            error={fieldError('withdraw_fee_bps')}
          />
          <PercentField
            label={t('sa.settingsDisputePartialLabel')}
            hint={t('sa.settingsDisputePartialHint')}
            value={values.dispute_partial_bps}
            onChangeText={field('dispute_partial_bps', percentMask)}
            error={fieldError('dispute_partial_bps')}
          />
          <Separator inset={0} />
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/admin/tax-methods')}
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingVertical: theme.spacing.sm,
            }}
          >
            <AppText weight="bold">{t('sa.settingsTaxMethodsRow')}</AppText>
            <AppText color="brandText">
              {taxMethods.data
                ? t('sa.settingsTaxMethodsCount', { count: taxMethods.data.enabled.length })
                : '—'}
            </AppText>
          </Pressable>
        </Card>

        <Card title={t('sa.settingsFreePeriodSection')}>
          <UnitField
            label={t('sa.settingsFreeDaysLabel')}
            hint={t('sa.settingsFreeDaysHint')}
            unit={t('sa.mapsDays')}
            value={values.free_period_days}
            onChangeText={field('free_period_days')}
            error={fieldError('free_period_days')}
          />
          <UnitField
            label={t('sa.settingsFreeReminderLabel')}
            hint={t('sa.settingsFreeReminderHint')}
            unit={t('sa.mapsDays')}
            value={values.free_period_reminder_days}
            onChangeText={field('free_period_reminder_days')}
            error={fieldError('free_period_reminder_days')}
          />
          <UnitField
            label={t('sa.settingsDemoBonusLabel')}
            hint={t('sa.settingsDemoBonusHint')}
            unit={t('common.currency')}
            value={values.demo_bonus}
            onChangeText={field('demo_bonus', priceDigits)}
            error={fieldError('demo_bonus')}
          />
        </Card>

        <Card title={t('sa.settingsWalletSection')}>
          <UnitField
            label={t('sa.settingsTopupMinLabel')}
            hint=""
            unit={t('common.currency')}
            value={values.topup_min}
            onChangeText={field('topup_min', priceDigits)}
            error={fieldError('topup_min')}
          />
        </Card>

        <Card title={t('sa.settingsPaymentsSection')}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {PAYMENT_METHODS.map((method) => {
              const selected = values.payment_methods_enabled.includes(method);
              return (
                <Pressable
                  key={method}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  onPress={() => toggle('payment_methods_enabled', method)}
                  style={{
                    paddingHorizontal: theme.spacing.md,
                    paddingVertical: theme.spacing.sm,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: selected ? theme.colors.brand : theme.colors.sep,
                    backgroundColor: selected ? theme.colors.brandSoft : theme.colors.bg,
                  }}
                >
                  <AppText
                    weight={selected ? 'bold' : 'medium'}
                    color={selected ? 'brandText' : 'text'}
                  >
                    {t(`payment.method.${method}`)}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
          <UnitField
            label={t('sa.settingsQrTtlLabel')}
            hint={t('sa.settingsQrTtlHint')}
            unit={t('sa.mapsSeconds')}
            value={values.qr_payment_ttl_sec}
            onChangeText={field('qr_payment_ttl_sec')}
            error={fieldError('qr_payment_ttl_sec')}
          />
        </Card>

        <Card title={t('sa.settingsReferralsSection')}>
          <ToggleRow
            label={t('sa.settingsReferralRequiredLabel')}
            value={values.referral_required}
            onValueChange={(value) =>
              setValues((prev) => (prev ? { ...prev, referral_required: value } : prev))
            }
          />
          <ToggleRow
            label={t('sa.settingsRefOnDemoLabel')}
            value={values.ref_on_demo_fee}
            onValueChange={(value) =>
              setValues((prev) => (prev ? { ...prev, ref_on_demo_fee: value } : prev))
            }
          />
        </Card>

        <Card title={t('sa.settingsConfirmationsSection')}>
          <UnitField
            label={t('sa.settingsConfirmReminderLabel')}
            hint={t('sa.settingsConfirmReminderHint')}
            unit={t('sa.settingsHours')}
            value={values.confirm_reminder_hours}
            onChangeText={field('confirm_reminder_hours')}
            error={fieldError('confirm_reminder_hours')}
          />
          <UnitField
            label={t('sa.settingsConfirmAdminLabel')}
            hint={t('sa.settingsConfirmAdminHint')}
            unit={t('sa.settingsHours')}
            value={values.confirm_admin_task_hours}
            onChangeText={field('confirm_admin_task_hours')}
            error={fieldError('confirm_admin_task_hours')}
          />
        </Card>

        <Card title={t('sa.settingsModerationSection')}>
          <UnitField
            label={t('sa.settingsBroadcastIntervalLabel')}
            hint={t('sa.settingsBroadcastIntervalHint')}
            unit={t('sa.mapsSeconds')}
            value={values.broadcast_min_interval_sec}
            onChangeText={field('broadcast_min_interval_sec')}
            error={fieldError('broadcast_min_interval_sec')}
          />
        </Card>
      </ScrollView>
    </View>
  );
}

function PercentField({
  label,
  hint,
  value,
  onChangeText,
  error,
}: {
  label: string;
  hint: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
}) {
  return (
    <BoxField
      label={`${label} · ${hint}`}
      value={value}
      onChangeText={onChangeText}
      keyboardType="decimal-pad"
      suffix={<UnitSuffix unit="%" />}
      error={error}
    />
  );
}

function UnitField({
  label,
  hint,
  unit,
  value,
  onChangeText,
  error,
}: {
  label: string;
  hint: string;
  unit: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
}) {
  return (
    <BoxField
      label={hint ? `${label} · ${hint}` : label}
      value={value}
      onChangeText={onChangeText}
      keyboardType="number-pad"
      suffix={<UnitSuffix unit={unit} />}
      error={error}
    />
  );
}

function UnitSuffix({ unit }: { unit: string }) {
  return (
    <AppText color="text2" weight="semibold">
      {unit}
    </AppText>
  );
}

function ToggleRow({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
      <AppText weight="bold" style={{ flex: 1 }}>
        {label}
      </AppText>
      <Switch
        value={value}
        onValueChange={onValueChange}
        accessibilityLabel={label}
        trackColor={{ true: theme.colors.brand, false: theme.colors.border }}
        thumbColor={theme.colors.bg}
      />
    </View>
  );
}
