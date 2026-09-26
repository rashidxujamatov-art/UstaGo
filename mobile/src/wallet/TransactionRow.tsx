import {
  ArrowDownLeft,
  ArrowUpRight,
  Gift,
  Hourglass,
  Landmark,
  type LucideIcon,
  Percent,
  Plus,
  RotateCcw,
  Users,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import type { LedgerTxType, WalletTransaction } from '../api/types';
import { AppText } from '../components/AppText';
import { formatPercent } from '../lib/format';
import { useOrderTexts } from '../orders/texts';
import { useTheme } from '../theme/ThemeProvider';
import type { ColorToken } from '../theme/tokens';

const LOOK: Record<LedgerTxType, { icon: LucideIcon; bg: ColorToken; fg: ColorToken }> = {
  ORDER_INCOME: { icon: ArrowDownLeft, bg: 'greenSoft', fg: 'green' },
  REFERRAL_L1: { icon: Users, bg: 'greenSoft', fg: 'green' },
  REFERRAL_L2: { icon: Users, bg: 'greenSoft', fg: 'green' },
  SERVICE_FEE: { icon: Percent, bg: 'orangeSoft', fg: 'orange' },
  TOPUP: { icon: Plus, bg: 'brandSoft', fg: 'brandText' },
  TOPUP_REFUND: { icon: RotateCcw, bg: 'surface2', fg: 'text2' },
  WITHDRAWAL: { icon: ArrowUpRight, bg: 'surface2', fg: 'text2' },
  WITHDRAWAL_FEE: { icon: Landmark, bg: 'surface2', fg: 'text2' },
  WITHDRAWAL_REFUND: { icon: RotateCcw, bg: 'brandSoft', fg: 'brandText' },
  WITHDRAWAL_FEE_REFUND: { icon: RotateCcw, bg: 'brandSoft', fg: 'brandText' },
  DEMO_BONUS: { icon: Gift, bg: 'orangeSoft', fg: 'orange' },
  DEMO_EXPIRE: { icon: Hourglass, bg: 'surface2', fg: 'text2' },
};

/** One BJ5 "Tarix" row: what happened, when, and the signed amount. */
export function TransactionRow({ item }: { item: WalletTransaction }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const texts = useOrderTexts();
  const look = LOOK[item.type];
  const Icon = look.icon;

  const amount = BigInt(item.amount);
  const demo = BigInt(item.demo_amount);
  const when = texts.startsAt(item.created_at);
  const order = item.order;

  let subtitle = when;
  if ((item.type === 'TOPUP' || item.type === 'TOPUP_REFUND') && item.provider) {
    subtitle = t('wallet.sub.topup', { provider: t(`wallet.providers.${item.provider}`), when });
  } else if (item.type === 'ORDER_INCOME' && order) {
    subtitle = t('wallet.sub.income', {
      method: t(`payment.method.${order.payment_method}`),
      when,
    });
  } else if (item.type === 'SERVICE_FEE' && order) {
    subtitle =
      order.payment_method === 'CASH' || order.payment_method === 'XOLIS_QR'
        ? t('wallet.sub.feeCash', { when })
        : t('wallet.sub.fee', {
            percent: order.fee_bps === null ? '' : formatPercent(order.fee_bps),
            when,
          });
  } else if ((item.type === 'REFERRAL_L1' || item.type === 'REFERRAL_L2') && item.from) {
    subtitle = t('wallet.sub.referral', {
      name: `${item.from.first_name} ${item.from.last_initial}.`,
      when,
    });
  }
  if (demo !== 0n && demo !== amount) {
    subtitle += ` · ${t('wallet.demoPart', { amount: texts.amount(demo < 0n ? -demo : demo) })}`;
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingVertical: theme.spacing.md,
      }}
    >
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors[look.bg],
        }}
      >
        <Icon size={22} color={theme.colors[look.fg]} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: theme.spacing.sm,
          }}
        >
          <AppText size="bodyLarge" weight="semibold">
            {t(`wallet.tx.${item.type}`, { number: order?.number ?? '' })}
          </AppText>
          {demo !== 0n ? (
            <View
              style={{
                paddingHorizontal: theme.spacing.sm,
                paddingVertical: 2,
                borderRadius: 999,
                backgroundColor: theme.colors.orangeSoft,
              }}
            >
              <AppText size="secondary" weight="bold" color="orange">
                {t('wallet.demoBadge')}
              </AppText>
            </View>
          ) : null}
        </View>
        <AppText color="text2">{subtitle}</AppText>
      </View>
      <AppText size="bodyLarge" weight="bold" color={amount > 0n ? 'green' : 'text'}>
        {amount > 0n ? `+${texts.amount(amount)}` : `−${texts.amount(-amount)}`}
      </AppText>
    </View>
  );
}
