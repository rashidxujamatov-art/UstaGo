import { Check, Flag } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Order } from '../api/types';
import { AppText } from '../components/AppText';
import { BarHeader } from '../components/ui/BarHeader';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Segmented } from '../components/ui/Segmented';
import { leave } from '../lib/navigation';
import { useTheme } from '../theme/ThemeProvider';
import { DangerLink, LockNote, StatusBanner } from './ConfirmParts';
import { DisputeSheet } from './DisputeSheet';
import { Footer } from './OrderParts';
import { usePaymentActions } from './payment-actions';
import { PaymentTag } from './PaymentTag';
import { useOrderTexts } from './texts';

/**
 * BY9: the customer pays cash or, when the pro uses Paynet Xolis, to their Xolis QR
 * instead — chosen here, not when the order was posted (decision of 2026-09-26, stage 5).
 * Either way, the customer then says "To'ladim" (§5.1).
 */
export function PayConfirm({ order }: { order: Order }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const texts = useOrderTexts();
  const actions = usePaymentActions(order);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const canChooseXolis = order.payment_method === 'CASH' && Boolean(order.xolis_qr);
  const [via, setVia] = useState<'CASH' | 'XOLIS_QR'>(
    order.payment_method === 'XOLIS_QR' ? 'XOLIS_QR' : 'CASH',
  );
  const xolis = canChooseXolis ? via === 'XOLIS_QR' : order.payment_method === 'XOLIS_QR';

  const steps = [
    t(xolis ? 'confirm.stepXolis' : 'confirm.stepCash'),
    t('confirm.stepPress'),
    t('confirm.stepExecutor'),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg2 }}>
      <BarHeader
        title={t('confirm.payTitle')}
        subtitle={t('confirm.orderLine', { number: order.number, title: order.title })}
      />
      <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}>
        <StatusBanner
          icon={Check}
          title={t('confirm.finished')}
          subtitle={t('confirm.finishedSub', {
            name: order.executor ? texts.executorShort(order.executor) : '',
            when: order.timeline.finished_at ? texts.startsAt(order.timeline.finished_at) : '',
          })}
        />

        <Card>
          <AppText size="bodyLarge" color="text2">
            {t('confirm.amountLabel')}
          </AppText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
            <AppText style={{ flex: 1 }}>
              <AppText size="amountLarge" weight="bold">
                {texts.amount(order.price)}
              </AppText>
              <AppText size="title" weight="semibold">{` ${t('common.currency')}`}</AppText>
            </AppText>
            <PaymentTag method={canChooseXolis ? via : order.payment_method} />
          </View>
          <AppText color="text2">{t('confirm.amountNote')}</AppText>
        </Card>

        {canChooseXolis ? (
          <Card title={t('confirm.chooseMethod')}>
            <Segmented
              options={[
                { value: 'CASH' as const, label: t('payment.method.CASH') },
                { value: 'XOLIS_QR' as const, label: t('payment.method.XOLIS_QR') },
              ]}
              value={via}
              onChange={setVia}
            />
            {via === 'XOLIS_QR' && order.xolis_qr ? (
              <View
                style={{
                  alignSelf: 'center',
                  marginTop: theme.spacing.sm,
                  padding: theme.spacing.lg,
                  borderRadius: theme.radius.card,
                  backgroundColor: theme.colors.qrBg,
                }}
              >
                <QRCode value={order.xolis_qr} size={180} />
              </View>
            ) : null}
          </Card>
        ) : null}

        <Card title={t('confirm.howTitle')}>
          {steps.map((step, index) => (
            <View
              key={step}
              style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.colors.brandSoft,
                }}
              >
                <AppText weight="bold" color="brandText">
                  {index + 1}
                </AppText>
              </View>
              <AppText size="bodyLarge" style={{ flex: 1 }}>
                {step}
              </AppText>
            </View>
          ))}
        </Card>

        <LockNote>{t('confirm.lockCustomer')}</LockNote>
      </ScrollView>

      <Footer>
        <View style={{ gap: theme.spacing.xs, paddingBottom: insets.bottom }}>
          <Button
            icon={Check}
            title={t('confirm.iPaid', { amount: texts.money(order.price) })}
            loading={actions.busy === 'paid'}
            disabled={actions.busy !== null}
            onPress={() =>
              void actions.paid(canChooseXolis ? via : undefined).then((done) => {
                if (done) leave({ pathname: '/order/[id]', params: { id: order.id } });
              })
            }
          />
          <DangerLink
            icon={Flag}
            label={t('confirm.problem')}
            disabled={actions.busy !== null}
            onPress={() => setDisputeOpen(true)}
          />
        </View>
      </Footer>

      <DisputeSheet
        visible={disputeOpen}
        executor={false}
        busy={actions.busy === 'dispute'}
        onClose={() => setDisputeOpen(false)}
        onConfirm={(note) =>
          void actions.dispute(note).then((done) => {
            setDisputeOpen(false);
            if (done) leave({ pathname: '/order/[id]', params: { id: order.id } });
          })
        }
      />
    </View>
  );
}
