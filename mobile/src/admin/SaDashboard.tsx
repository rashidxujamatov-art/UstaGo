import { router } from 'expo-router';
import { BarChart3, Key, type LucideIcon, Percent } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSaDashboard, useSaSettings } from '../api/queries';
import type { FinancePeriod } from '../api/types';
import { useErrorText } from '../api/use-error-text';
import { AppText } from '../components/AppText';
import { BarHeader } from '../components/ui/BarHeader';
import { Segmented } from '../components/ui/Segmented';
import { Tag } from '../components/ui/Chip';
import { formatPercent } from '../lib/format';
import { netBps, platformShare, sharePercentBps } from './finance-format';
import { OrderPlaceholder } from '../orders/OrderParts';
import { useOrderTexts } from '../orders/texts';
import { useTheme } from '../theme/ThemeProvider';

/** SA1 "Boshqaruv": period totals, the commission split, and the way into SA2/SA3/SA4. */
export function SaDashboard() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const errorText = useErrorText();
  const texts = useOrderTexts();
  const [period, setPeriod] = useState<FinancePeriod>('today');
  const dashboard = useSaDashboard(period);
  const settings = useSaSettings();

  if (!dashboard.data || !settings.data) {
    const failed = dashboard.isError ? dashboard.error : settings.isError ? settings.error : null;
    return (
      <OrderPlaceholder
        error={failed ? errorText(failed) : null}
        onRetry={() => {
          void dashboard.refetch();
          void settings.refetch();
        }}
      />
    );
  }
  const data = dashboard.data;
  const rates = settings.data.rates;
  const commissionReal = data.commission_real;
  const platformRow = platformShare(commissionReal, data.referral.l1, data.referral.l2);
  const net = netBps(rates.fee_bps, rates.ref_l1_bps, rates.ref_l2_bps);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg2 }}>
      <BarHeader
        title={t('sa.dashboardTitle')}
        right={<Tag label={t('admin.roleSuperAdmin')} tone="neutral" />}
      />
      <View style={{ padding: theme.spacing.lg }}>
        <Segmented
          value={period}
          onChange={setPeriod}
          options={[
            { value: 'today', label: t('sa.periodToday') },
            { value: 'week', label: t('sa.periodWeek') },
            { value: 'month', label: t('sa.periodMonth') },
          ]}
        />
      </View>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: insets.bottom + theme.spacing.xl,
          gap: theme.spacing.lg,
        }}
      >
        <View
          style={{
            padding: theme.spacing.lg,
            gap: theme.spacing.sm,
            borderRadius: theme.radius.card,
            backgroundColor: theme.colors.surface,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <AppText color="text2">{t('sa.platformNet')}</AppText>
            <Tag label={t('sa.realMoneyBadge')} tone="green" />
          </View>
          <AppText size="titleLarge" weight="bold">
            {texts.money(data.platform_net)}
          </AppText>
          <ShareBar
            platform={sharePercentBps(platformRow, commissionReal)}
            l1={sharePercentBps(data.referral.l1, commissionReal)}
            l2={sharePercentBps(data.referral.l2, commissionReal)}
          />
          <ShareRow
            label={t('sa.platformShare')}
            percent={net}
            amount={texts.amount(platformRow)}
          />
          <ShareRow
            label={t('sa.refL1')}
            percent={rates.ref_l1_bps}
            amount={texts.amount(data.referral.l1)}
          />
          <ShareRow
            label={t('sa.refL2')}
            percent={rates.ref_l2_bps}
            amount={texts.amount(data.referral.l2)}
          />
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingTop: theme.spacing.sm,
              borderTopWidth: 1,
              borderTopColor: theme.colors.sep,
            }}
          >
            <AppText weight="bold">
              {t('sa.totalCommission')} · {formatPercent(rates.fee_bps)}%
            </AppText>
            <AppText weight="bold">{texts.amount(commissionReal)}</AppText>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText color="text2">{t('sa.demoReferralLine')}</AppText>
            <AppText color="red">−{texts.amount(data.marketing_budget_spent)}</AppText>
          </View>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md }}>
          <StatBox label={t('sa.turnover')} value={texts.amount(data.turnover)} />
          <StatBox
            label={t('sa.freePeriodExecs')}
            value={String(data.pros_in_free_period)}
            sub={t('sa.freePeriodExecsSub')}
          />
          <StatBox
            label={t('sa.usersTotalCard')}
            value={String(data.users_total.customers + data.users_total.executors)}
            sub={t('sa.usersTotalCardSub', {
              executors: data.users_total.executors,
              customers: data.users_total.customers,
            })}
          />
          <StatBox
            label={t('sa.demoCommissionCard')}
            value={texts.amount(data.demo_commission)}
            sub={t('sa.demoCommissionCardSub')}
            dashed
          />
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <NavRow
            icon={Percent}
            label={t('sa.navSettings')}
            onPress={() => router.push('/admin/sa/settings')}
          />
          <NavRow
            icon={Key}
            label={t('sa.navStaff')}
            onPress={() => router.push('/admin/sa/staff')}
          />
          <NavRow
            icon={BarChart3}
            label={t('sa.navFinance')}
            onPress={() => router.push('/admin/sa/finance')}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function ShareBar({ platform, l1, l2 }: { platform: number; l1: number; l2: number }) {
  const theme = useTheme();
  const total = platform + l1 + l2 || 1;
  return (
    <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden' }}>
      <View style={{ flex: platform, backgroundColor: theme.colors.brand }} />
      <View style={{ flex: l1, backgroundColor: theme.colors.orange }} />
      <View style={{ flex: l2, backgroundColor: theme.colors.green }} />
      <View
        style={{ flex: Math.max(total - platform - l1 - l2, 0), backgroundColor: theme.colors.sep }}
      />
    </View>
  );
}

function ShareRow({ label, percent, amount }: { label: string; percent: number; amount: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <AppText color="text2">
        {label} · {formatPercent(percent)}%
      </AppText>
      <AppText weight="semibold">{amount}</AppText>
    </View>
  );
}

function StatBox({
  label,
  value,
  sub,
  dashed = false,
}: {
  label: string;
  value: string;
  sub?: string;
  dashed?: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexBasis: '47%',
        flexGrow: 1,
        padding: theme.spacing.lg,
        gap: 2,
        borderRadius: theme.radius.card,
        borderWidth: dashed ? 1 : 0,
        borderStyle: dashed ? 'dashed' : 'solid',
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
      }}
    >
      <AppText color="text2">{label}</AppText>
      <AppText size="title" weight="bold">
        {value}
      </AppText>
      {sub ? (
        <AppText color="text2" size="secondary">
          {sub}
        </AppText>
      ) : null}
    </View>
  );
}

function NavRow({
  icon: Icon,
  label,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        padding: theme.spacing.lg,
        borderRadius: theme.radius.card,
        backgroundColor: pressed ? theme.colors.surface2 : theme.colors.surface,
      })}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: theme.radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.brandSoft,
        }}
      >
        <Icon size={20} color={theme.colors.brand} />
      </View>
      <AppText size="bodyLarge" weight="bold" style={{ flex: 1 }}>
        {label}
      </AppText>
    </Pressable>
  );
}
