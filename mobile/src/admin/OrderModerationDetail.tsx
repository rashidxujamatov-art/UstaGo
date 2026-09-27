import { useQueryClient } from '@tanstack/react-query';
import { Ban } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { endpoints } from '../api/endpoints';
import { queryKeys, useAdminOrder } from '../api/queries';
import { useErrorText } from '../api/use-error-text';
import { AppText } from '../components/AppText';
import { BarHeader } from '../components/ui/BarHeader';
import { BottomSheet } from '../components/ui/BottomSheet';
import { Button } from '../components/ui/Button';
import { BoxField } from '../components/ui/BoxField';
import { Card, Separator } from '../components/ui/Card';
import { formatOrderNumber } from '../lib/format';
import { showNotice } from '../lib/notice';
import { OrderPlaceholder, PhotoStrip } from '../orders/OrderParts';
import { PaymentTag } from '../orders/PaymentTag';
import { statusColor } from '../orders/status';
import { useOrderTexts } from '../orders/texts';
import { useTheme } from '../theme/ThemeProvider';

/** Orders moderation detail: full order view, its status timeline, and an admin cancel. */
export function OrderModerationDetail({ id }: { id: string }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const errorText = useErrorText();
  const texts = useOrderTexts();
  const client = useQueryClient();
  const item = useAdminOrder(id);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  if (!item.data) {
    return (
      <OrderPlaceholder
        error={item.isError ? errorText(item.error) : null}
        onRetry={() => void item.refetch()}
      />
    );
  }
  const { order, events } = item.data;

  const cancel = async () => {
    if (!reason.trim()) return;
    setBusy(true);
    try {
      await endpoints.moderateCancelOrder(id, reason.trim());
      void client.invalidateQueries({ queryKey: queryKeys.adminOrder(id) });
      void client.invalidateQueries({ queryKey: queryKeys.adminOrders({}) });
      setCancelling(false);
      setReason('');
    } catch (error) {
      showNotice(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg2 }}>
      <BarHeader title={t('admin.orderDetailTitle', { number: formatOrderNumber(order.number) })} />
      <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}>
        <Card>
          <AppText size="bodyLarge" weight="bold">
            {texts.category(order.category)} · {order.title}
          </AppText>
          <AppText color="text2">{texts.fullAddress(order.address)}</AppText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <AppText color={statusColor(order.status)} weight="semibold">
              {t(`orderStatus.${order.status}`)}
            </AppText>
            <PaymentTag method={order.payment_method} long />
          </View>
          <Separator inset={0} />
          <RowLine label={t('common.money')} value={texts.money(order.price)} />
          <RowLine
            label={t('admin.userOrdersAsCustomer')}
            value={texts.customerName(order.customer)}
          />
          {order.executor ? (
            <RowLine
              label={t('admin.userOrdersAsExecutor')}
              value={texts.executorShort(order.executor)}
            />
          ) : null}
          <PhotoStrip urls={order.photos} />
        </Card>

        <Card title={t('admin.orderEventsSection')}>
          {events.length === 0 ? (
            <AppText color="text2">—</AppText>
          ) : (
            events.map((event, index) => (
              <View key={index}>
                {index > 0 ? <Separator inset={0} /> : null}
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    paddingVertical: theme.spacing.xs,
                  }}
                >
                  <AppText>
                    {t('admin.orderEventFrom', {
                      from: event.from_status ? t(`orderStatus.${event.from_status}`) : '—',
                      to: t(`orderStatus.${event.to_status}`),
                    })}
                  </AppText>
                  <AppText color="text2">{texts.clock(event.at)}</AppText>
                </View>
              </View>
            ))
          )}
        </Card>

        <Button
          icon={Ban}
          title={t('admin.orderCancelButton')}
          onPress={() => setCancelling(true)}
          style={{ backgroundColor: theme.colors.red }}
        />
      </ScrollView>

      <BottomSheet
        visible={cancelling}
        onClose={() => setCancelling(false)}
        footer={
          <>
            <Button
              title={t('admin.orderCancelConfirm')}
              loading={busy}
              disabled={reason.trim().length === 0}
              onPress={() => void cancel()}
              style={{ backgroundColor: theme.colors.red }}
            />
            <Button
              variant="link"
              title={t('common.cancel')}
              onPress={() => setCancelling(false)}
            />
          </>
        }
      >
        <AppText size="title" weight="bold" accessibilityRole="header">
          {t('admin.orderCancelTitle')}
        </AppText>
        <BoxField
          label={t('admin.orderCancelReasonLabel')}
          value={reason}
          onChangeText={setReason}
          maxLength={500}
          multiline
          autoFocus
        />
      </BottomSheet>
    </View>
  );
}

function RowLine({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: theme.spacing.xs,
      }}
    >
      <AppText color="text2">{label}</AppText>
      <AppText weight="bold">{value}</AppText>
    </View>
  );
}
