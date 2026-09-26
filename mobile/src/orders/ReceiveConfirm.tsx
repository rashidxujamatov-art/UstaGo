import { router } from 'expo-router';
import { ArrowRight, Banknote, Check, CircleX, Clock } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWallet } from '../api/queries';
import type { Order } from '../api/types';
import { AppText } from '../components/AppText';
import { BarHeader } from '../components/ui/BarHeader';
import { Button } from '../components/ui/Button';
import { Card, Separator } from '../components/ui/Card';
import { formatPercent } from '../lib/format';
import { useTheme } from '../theme/ThemeProvider';
import { netIncome } from './amounts';
import { DangerLink, LockNote, MoneyLine, StatusBanner } from './ConfirmParts';
import { DisputeSheet } from './DisputeSheet';
import { Footer } from './OrderParts';
import { usePaymentActions } from './payment-actions';
import { useOrderTexts } from './texts';

/**
 * BJ13: the executor confirms the cash / Xolis money. The fee held at acceptance is then
 * charged automatically (§5.1); "Pul kelmadi" opens a dispute.
 */
export function ReceiveConfirm({ order }: { order: Order }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const texts = useOrderTexts();
  const wallet = useWallet();
  const actions = usePaymentActions(order);
  const [disputeOpen, setDisputeOpen] = useState(false);

  const fee = order.fee ? BigInt(order.fee.fee) : 0n;
  const fromDemo = order.fee !== null && BigInt(order.fee.fee_real) === 0n;
  const percent = order.fee?.fee_bps ? formatPercent(order.fee.fee_bps) : '';
  const balance = wallet.data ? BigInt(wallet.data.real) + BigInt(wallet.data.demo) : null;
  const paidAt = order.timeline.customer_paid_at;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg2 }}>
      <BarHeader
        title={t('confirm.receiveTitle')}
        subtitle={t('confirm.receiveLine', {
          number: order.number,
          name: texts.customerName(order.customer),
        })}
      />
      <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}>
        {paidAt ? (
          <StatusBanner
            icon={Banknote}
            title={t('confirm.customerPaid')}
            subtitle={t('confirm.customerPaidSub', {
              when: texts.startsAt(paidAt),
              method: t(`payment.method.${order.payment_method}`),
            })}
          />
        ) : (
          <StatusBanner
            icon={Clock}
            tone="orange"
            title={t('confirm.customerNotYet')}
            subtitle={t('confirm.customerNotYetSub')}
          />
        )}

        <Card title={t('confirm.settlement')}>
          <MoneyLine
            label={t(
              order.payment_method === 'XOLIS_QR'
                ? 'confirm.receivedXolis'
                : 'confirm.receivedCash',
            )}
            value={texts.money(order.price)}
          />
          <MoneyLine
            label={t(fromDemo ? 'confirm.feeDemo' : 'confirm.fee', { percent })}
            value={texts.money(-fee)}
            color="red"
          />
          <Separator />
          <MoneyLine
            label={t('confirm.net')}
            value={texts.money(netIncome(order.price, fee.toString()))}
            color="green"
            strong
          />
        </Card>

        {balance !== null ? (
          <Card>
            <AppText size="bodyLarge" color="text2">
              {t('confirm.balance')}
            </AppText>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: theme.spacing.md,
              }}
            >
              <AppText size="title" color="text2">
                {texts.money(balance)}
              </AppText>
              <ArrowRight size={22} color={theme.colors.text2} />
              <AppText size="titleLarge" weight="bold">
                {texts.money(balance - fee)}
              </AppText>
            </View>
            <AppText color="text2">{t('confirm.heldNote', { fee: texts.amount(fee) })}</AppText>
          </Card>
        ) : null}

        <LockNote>{t('confirm.lockExecutor')}</LockNote>
      </ScrollView>

      <Footer>
        <View style={{ gap: theme.spacing.xs, paddingBottom: insets.bottom }}>
          <Button
            icon={Check}
            title={t('payment.iReceived')}
            loading={actions.busy === 'received'}
            disabled={actions.busy !== null}
            onPress={() =>
              void actions.received().then((done) => {
                if (done) router.back();
              })
            }
          />
          <DangerLink
            icon={CircleX}
            label={t('payment.notReceived')}
            disabled={actions.busy !== null}
            onPress={() => setDisputeOpen(true)}
          />
        </View>
      </Footer>

      <DisputeSheet
        visible={disputeOpen}
        executor
        busy={actions.busy === 'dispute'}
        onClose={() => setDisputeOpen(false)}
        onConfirm={(note) =>
          void actions.dispute(note).then((done) => {
            setDisputeOpen(false);
            if (done) router.back();
          })
        }
      />
    </View>
  );
}
