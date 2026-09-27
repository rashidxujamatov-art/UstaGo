import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { endpoints } from '../api/endpoints';
import { queryKeys, useSaFinanceOrders, useSaFinanceSummary } from '../api/queries';
import type { FinanceOrderRow, FinancePeriod } from '../api/types';
import { useErrorText } from '../api/use-error-text';
import { AppText } from '../components/AppText';
import { BarHeader } from '../components/ui/BarHeader';
import { Button } from '../components/ui/Button';
import { Card, Separator } from '../components/ui/Card';
import { Tag } from '../components/ui/Chip';
import { Segmented } from '../components/ui/Segmented';
import { formatOrderNumber, formatPercent } from '../lib/format';
import { PAYMENT_ICONS } from '../orders/PaymentTag';
import { useOrderTexts } from '../orders/texts';
import { periodRange } from './finance-format';
import { isSuperAdmin } from './permissions';
import { useSession } from '../store/session';
import { useTheme } from '../theme/ThemeProvider';

/** SA4 "Moliya hisobi": totals for the period, then a per-order breakdown, paginated. */
export function SaFinance() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const errorText = useErrorText();
  const texts = useOrderTexts();
  const user = useSession((state) => state.user);
  const superAdmin = user ? isSuperAdmin(user) : false;
  const [period, setPeriod] = useState<FinancePeriod>('today');
  const summary = useSaFinanceSummary(period);
  const range = periodRange(period === 'custom' ? 'today' : period);
  const orders = useSaFinanceOrders(range);
  // Only a super admin can read `/sa/settings`; a plain `finance.view` admin sees the
  // commission line without its rate percentage rather than a request that always 403s.
  const settings = useQuery({
    queryKey: queryKeys.saSettings,
    queryFn: endpoints.saSettings,
    enabled: superAdmin,
  });

  const items = orders.data?.pages.flatMap((page) => page.items) ?? [];

  if (!summary.data) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg2 }}>
        <BarHeader title={t('sa.financeTitle')} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {summary.isError ? (
            <View style={{ gap: theme.spacing.md, padding: theme.spacing.xl }}>
              <AppText style={{ textAlign: 'center' }}>{errorText(summary.error)}</AppText>
              <Button
                variant="secondary"
                title={t('common.retry')}
                onPress={() => void summary.refetch()}
              />
            </View>
          ) : (
            <ActivityIndicator color={theme.colors.brand} />
          )}
        </View>
      </View>
    );
  }
  const data = summary.data;
  const feeBps = settings.data?.rates.fee_bps;
  const l1Bps = settings.data?.rates.ref_l1_bps;
  const l2Bps = settings.data?.rates.ref_l2_bps;
  const referralTotal = (BigInt(data.referral.l1) + BigInt(data.referral.l2)).toString();

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg2 }}>
      <BarHeader title={t('sa.financeTitle')} />
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
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <FinanceOrderRowView item={item} />}
        onEndReached={() => {
          if (orders.hasNextPage) void orders.fetchNextPage();
        }}
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: insets.bottom + theme.spacing.xl,
          gap: theme.spacing.lg,
        }}
        ListHeaderComponent={
          <View
            style={{
              padding: theme.spacing.lg,
              gap: theme.spacing.sm,
              borderRadius: theme.radius.card,
              backgroundColor: theme.colors.surface,
              marginBottom: theme.spacing.lg,
            }}
          >
            <SummaryRow
              label={
                feeBps !== undefined
                  ? t('sa.financeCommissionLine', { percent: formatPercent(feeBps) })
                  : t('sa.totalCommission')
              }
              value={texts.amount(data.commission_real)}
              bold
            />
            <SummaryRow
              label={
                l1Bps !== undefined && l2Bps !== undefined
                  ? t('sa.financeReferralLine', {
                      percent: `${formatPercent(l1Bps)}+${formatPercent(l2Bps)}`,
                    })
                  : t('sa.financeReferralLineShort')
              }
              value={`−${texts.amount(referralTotal)}`}
              negative
            />
            <SummaryRow
              label={t('sa.financeDemoReferralLine')}
              value={`−${texts.amount(data.marketing_budget_spent)}`}
              negative
            />
            <Separator inset={0} />
            <SummaryRow
              label={t('sa.financePlatformNetLine')}
              value={texts.amount(data.platform_net)}
              bold
            />
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <AppText color="text2">{t('sa.financeDemoCommissionLine')}</AppText>
                <Tag label="DEMO" tone="orange" />
              </View>
              <AppText color="text2" style={{ textDecorationLine: 'line-through' }}>
                {texts.amount(data.demo_commission)}
              </AppText>
            </View>
          </View>
        }
        ListFooterComponent={
          <>
            {orders.isFetchingNextPage ? (
              <ActivityIndicator
                color={theme.colors.brand}
                style={{ marginTop: theme.spacing.md }}
              />
            ) : null}
          </>
        }
        ListEmptyComponent={
          orders.isPending ? (
            <ActivityIndicator color={theme.colors.brand} style={{ margin: theme.spacing.xxl }} />
          ) : (
            <AppText color="text2" style={{ textAlign: 'center', padding: theme.spacing.xxl }}>
              {t('sa.financeEmpty')}
            </AppText>
          )
        }
      />
    </View>
  );
}

function SummaryRow({
  label,
  value,
  bold = false,
  negative = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
  negative?: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <AppText color={bold ? 'text' : 'text2'} weight={bold ? 'bold' : 'regular'}>
        {label}
      </AppText>
      <AppText
        weight={bold ? 'bold' : 'semibold'}
        color={negative ? 'red' : bold ? 'green' : 'text'}
      >
        {value}
      </AppText>
    </View>
  );
}

function FinanceOrderRowView({ item }: { item: FinanceOrderRow }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const texts = useOrderTexts();
  const Icon = PAYMENT_ICONS[item.payment_method];

  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
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
      <View style={{ flex: 1 }}>
        <AppText weight="bold">
          {formatOrderNumber(item.number)} · {t(`payment.method.${item.payment_method}`)} ·{' '}
          {texts.amount(item.price)}
        </AppText>
        <AppText color="text2" size="secondary">
          {t('sa.totalCommission')} {texts.amount(item.fee)}
        </AppText>
      </View>
      <AppText weight="bold" color="green">
        +{texts.amount(item.platform_net)}
      </AppText>
    </Card>
  );
}
