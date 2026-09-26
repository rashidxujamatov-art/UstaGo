import { Check, CircleX, Flag, Lock } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';
import { useOrder } from '../api/queries';
import { AppText } from '../components/AppText';
import { BottomSheet } from '../components/ui/BottomSheet';
import { Button } from '../components/ui/Button';
import { initials } from '../lib/input';
import { useTheme } from '../theme/ThemeProvider';
import { DangerLink, InfoNote, PendingOrderCard } from './ConfirmParts';
import { DisputeSheet } from './DisputeSheet';
import { usePaymentActions } from './payment-actions';
import { useOrderTexts } from './texts';

interface ConfirmBlockSheetProps {
  /** The job waiting for confirmation (`order_id` of the block error), or null when closed. */
  orderId: string | null;
  onClose: () => void;
}

/**
 * BY10 over the new-order form and BJ14 over a job: the previous cash / Xolis job must be
 * confirmed first (§5.1). The confirmation can be given right here.
 */
export function ConfirmBlockSheet({ orderId, onClose }: ConfirmBlockSheetProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const texts = useOrderTexts();
  const order = useOrder(orderId ?? '', orderId !== null);
  const actions = usePaymentActions(order.data);
  const [disputing, setDisputing] = useState(false);

  if (!orderId) return null;
  const data = order.data;
  const executor = data?.viewer_role === 'EXECUTOR';

  const close = () => {
    setDisputing(false);
    onClose();
  };

  if (disputing && data) {
    return (
      <DisputeSheet
        visible
        executor={executor}
        busy={actions.busy === 'dispute'}
        onClose={() => setDisputing(false)}
        onConfirm={(note) =>
          void actions.dispute(note).then((done) => {
            if (done) close();
            else setDisputing(false);
          })
        }
      />
    );
  }

  const counterpart = data
    ? executor
      ? {
          initials: initials(data.customer.first_name, data.customer.last_initial),
          name: texts.customerName(data.customer),
          at: data.timeline.customer_paid_at ?? data.timeline.finished_at,
        }
      : {
          initials: initials(data.executor?.first_name, data.executor?.last_name),
          name: data.executor ? texts.executorShort(data.executor) : '',
          at: data.timeline.finished_at,
        }
    : null;

  return (
    <BottomSheet
      visible
      onClose={close}
      footer={
        data ? (
          <>
            {executor ? (
              <Button
                icon={Check}
                title={t('payment.iReceived')}
                loading={actions.busy === 'received'}
                onPress={() =>
                  void actions.received().then((done) => {
                    if (done) close();
                  })
                }
              />
            ) : (
              <Button
                icon={Check}
                title={t('confirm.iPaid', { amount: texts.money(data.price) })}
                loading={actions.busy === 'paid'}
                onPress={() =>
                  void actions.paid().then((done) => {
                    if (done) close();
                  })
                }
              />
            )}
            <DangerLink
              icon={executor ? CircleX : Flag}
              label={t(executor ? 'payment.notReceived' : 'confirm.problem')}
              disabled={actions.busy !== null}
              onPress={() => setDisputing(true)}
            />
          </>
        ) : undefined
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg }}>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.orangeSoft,
          }}
        >
          <Lock size={28} color={theme.colors.orange} />
        </View>
        <AppText size="titleLarge" weight="bold" accessibilityRole="header" style={{ flex: 1 }}>
          {t(executor ? 'confirm.blockExecutorTitle' : 'confirm.blockCustomerTitle')}
        </AppText>
      </View>

      {data && counterpart ? (
        <>
          <AppText size="bodyLarge">
            {executor
              ? data.status === 'COMPLETED'
                ? t('confirm.blockExecutorPaid', {
                    number: data.number,
                    amount: texts.amount(data.price),
                  })
                : t('confirm.blockExecutorWaiting', { number: data.number })
              : t('confirm.blockCustomerText', { number: data.number })}
          </AppText>
          <PendingOrderCard
            initials={counterpart.initials}
            title={`#${data.number} · ${data.title}`}
            subtitle={[counterpart.name, counterpart.at ? texts.clock(counterpart.at) : null]
              .filter(Boolean)
              .join(' · ')}
            amount={texts.amount(data.price)}
            method={t(`payment.method.${data.payment_method}`)}
          />
          {executor && data.fee ? (
            <InfoNote>{t('confirm.feeAuto', { fee: texts.amount(data.fee.fee) })}</InfoNote>
          ) : null}
        </>
      ) : (
        <ActivityIndicator color={theme.colors.brand} />
      )}
    </BottomSheet>
  );
}
