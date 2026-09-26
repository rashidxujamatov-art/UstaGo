import { useQueryClient } from '@tanstack/react-query';
import { EllipsisVertical, Search } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { endpoints } from '../api/endpoints';
import { invalidateOrder, queryKeys } from '../api/queries';
import type { CancelReason, Order } from '../api/types';
import { useErrorText } from '../api/use-error-text';
import { AppText } from '../components/AppText';
import { BarHeader, BarIconButton } from '../components/ui/BarHeader';
import { Card, Separator } from '../components/ui/Card';
import { useTheme } from '../theme/ThemeProvider';
import { CancelSheet } from './CancelSheet';
import { DetailRow, Footer, PhotoStrip } from './OrderParts';
import { PartyCard } from './PartyCard';
import { canCancel } from './status';
import { useOrderTexts } from './texts';
import { Timeline } from './Timeline';
import { showNotice } from '../lib/notice';

interface CustomerOrderProps {
  order: Order;
  refreshing: boolean;
  onRefresh: () => void;
}

/** BY3: the customer follows their order, contacts the pro or cancels. */
export function CustomerOrder({ order, refreshing, onRefresh }: CustomerOrderProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const errorText = useErrorText();
  const client = useQueryClient();
  const texts = useOrderTexts();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const cancel = async (reason: CancelReason, note?: string) => {
    setCancelling(true);
    try {
      client.setQueryData(
        queryKeys.order(order.id),
        await endpoints.cancelOrder(order.id, reason, note),
      );
      invalidateOrder(client, order.id);
      setCancelOpen(false);
    } catch (error) {
      showNotice(errorText(error));
    } finally {
      setCancelling(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg2 }}>
      <BarHeader
        title={t('order.title', { number: order.number })}
        subtitle={t(`orderStatus.${order.status}`)}
        right={
          canCancel(order.status) ? (
            <BarIconButton
              icon={EllipsisVertical}
              label={t('order.menu')}
              onPress={() => setCancelOpen(true)}
            />
          ) : null
        }
      />
      <ScrollView
        contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.brand}
          />
        }
      >
        {order.executor ? (
          <PartyCard
            order={order}
            firstName={order.executor.first_name}
            lastName={order.executor.last_name}
            subtitle={texts.category(order.category)}
            phone={order.executor.phone}
          />
        ) : order.status === 'PUBLISHED' ? (
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
              <Search size={24} color={theme.colors.orange} />
              <AppText size="bodyLarge" weight="semibold" style={{ flex: 1 }}>
                {t('order.noExecutor')}
              </AppText>
            </View>
          </Card>
        ) : null}

        <Timeline
          order={order}
          hint={order.status === 'DONE_BY_EXECUTOR' ? t('timeline.checkAndAccept') : undefined}
        />

        <Card style={{ gap: 0, paddingVertical: theme.spacing.sm }}>
          <DetailRow label={t('order.job')}>
            <AppText size="bodyLarge" weight="semibold">
              {order.title}
            </AppText>
            {order.description ? (
              <AppText color="text2" style={{ marginTop: theme.spacing.xs }}>
                {order.description}
              </AppText>
            ) : null}
          </DetailRow>
          <Separator />
          <DetailRow label={t('order.address')}>
            <AppText size="bodyLarge" weight="semibold">
              {texts.fullAddress(order.address)}
            </AppText>
          </DetailRow>
          <Separator />
          <DetailRow label={t('newOrder.when')}>
            <AppText size="bodyLarge" weight="semibold">
              {texts.range(order.time_from, order.time_to)}
            </AppText>
          </DetailRow>
          <Separator />
          <DetailRow label={t('order.price')}>
            <AppText size="bodyLarge" weight="bold">
              {texts.money(order.price)}
            </AppText>
          </DetailRow>
          {order.photos.length > 0 || order.finish_photos.length > 0 ? (
            <View style={{ paddingVertical: theme.spacing.sm, gap: theme.spacing.sm }}>
              <PhotoStrip urls={[...order.photos, ...order.finish_photos]} />
            </View>
          ) : null}
        </Card>
        <View style={{ height: insets.bottom }} />
      </ScrollView>

      {order.status === 'DONE_BY_EXECUTOR' ? (
        <Footer>
          <AppText color="text2" style={{ textAlign: 'center', paddingBottom: insets.bottom }}>
            {t('order.paymentNext')}
          </AppText>
        </Footer>
      ) : null}

      <CancelSheet
        visible={cancelOpen}
        taken={order.status !== 'PUBLISHED'}
        busy={cancelling}
        onClose={() => setCancelOpen(false)}
        onConfirm={(reason, note) => void cancel(reason, note)}
      />
    </View>
  );
}
