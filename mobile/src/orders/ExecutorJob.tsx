import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import {
  Calendar,
  Check,
  CircleCheck,
  CircleX,
  type LucideIcon,
  MapPin,
  Navigation,
  QrCode,
  User,
} from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError } from '../api/client';
import { endpoints } from '../api/endpoints';
import { invalidateOrder, queryKeys, useAcceptPreview, useConfig } from '../api/queries';
import type { Order } from '../api/types';
import { useErrorText } from '../api/use-error-text';
import { AppText } from '../components/AppText';
import { BarHeader } from '../components/ui/BarHeader';
import { Button } from '../components/ui/Button';
import { Card, Separator } from '../components/ui/Card';
import { Tag } from '../components/ui/Chip';
import { ConfirmSheet } from '../components/ui/ConfirmSheet';
import { categoryIcon } from '../lib/categories';
import { formatPercent } from '../lib/format';
import { openDirections } from '../lib/maps';
import { requestShareLocationPermissions } from '../lib/location';
import { startTripTracking } from '../location/trip-task';
import { usePreferences } from '../store/preferences';
import { useTheme } from '../theme/ThemeProvider';
import { netIncome } from './amounts';
import { ConfirmBlockSheet } from './ConfirmBlockSheet';
import { DangerLink } from './ConfirmParts';
import { DepartSheet } from './DepartSheet';
import { DisputeSheet } from './DisputeSheet';
import { FinishSheet } from './FinishSheet';
import { InsufficientSheet, type Shortfall } from './InsufficientSheet';
import { Footer, PhotoStrip } from './OrderParts';
import { PartyCard } from './PartyCard';
import { PaymentTag } from './PaymentTag';
import { usePaymentActions } from './payment-actions';
import {
  awaitsExecutorReceived,
  awaitsOnlinePayment,
  hasPaymentQr,
  canDecline,
  canDispute,
  type ExecutorStep,
  nextExecutorStep,
  paymentKind,
} from './status';
import { useOrderTexts } from './texts';
import { Timeline } from './Timeline';
import { showNotice } from '../lib/notice';

interface ExecutorJobProps {
  order: Order;
  refreshing: boolean;
  onRefresh: () => void;
}

type Busy = 'accept' | 'decline' | ExecutorStep | null;

/** BJ2 before acceptance; afterwards the executor's job with the next step button. */
export function ExecutorJob({ order, refreshing, onRefresh }: ExecutorJobProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const errorText = useErrorText();
  const client = useQueryClient();
  const texts = useOrderTexts();
  const mine = order.viewer_role === 'EXECUTOR';
  const open = !mine && order.status === 'PUBLISHED';
  const preview = useAcceptPreview(order.id, open);
  const config = useConfig();
  const departIntroShown = usePreferences((state) => state.departIntroShown);
  const setDepartIntroShown = usePreferences((state) => state.setDepartIntroShown);
  const [busy, setBusy] = useState<Busy>(null);
  const [shortfall, setShortfall] = useState<Shortfall | null>(null);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [departOpen, setDepartOpen] = useState(false);
  const [blockingOrder, setBlockingOrder] = useState<string | null>(null);
  const actions = usePaymentActions(order);

  const run = async (key: NonNullable<Busy>, action: () => Promise<Order>) => {
    setBusy(key);
    try {
      client.setQueryData(queryKeys.order(order.id), await action());
      invalidateOrder(client, order.id);
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.code === 'WALLET_INSUFFICIENT_TO_ACCEPT') {
        const { params } = error;
        setShortfall({
          shortfall: String(params.shortfall ?? '0'),
          required: String(params.required ?? '0'),
          available: String(params.available ?? '0'),
          feeBps: preview.data?.fee_bps ?? 0,
          orderNumber: order.number,
        });
      } else if (
        error instanceof ApiError &&
        error.code === 'ORDER_EXECUTOR_CONFIRMATION_REQUIRED' &&
        typeof error.params.order_id === 'string'
      ) {
        // BJ14: the previous cash / Xolis job must be confirmed first (§5.1).
        setBlockingOrder(error.params.order_id);
      } else if (error instanceof ApiError && error.code === 'TAX_METHOD_REQUIRED') {
        // BJ8: the free month is over and no tax method is verified yet.
        router.push('/tax');
      } else {
        showNotice(errorText(error));
        if (error instanceof ApiError && error.status === 409) invalidateOrder(client, order.id);
      }
      return false;
    } finally {
      setBusy(null);
    }
  };

  const step = mine ? nextExecutorStep(order.status) : null;
  const fee = mine ? order.fee : preview.data;
  const feeBps = mine ? order.fee?.fee_bps : preview.data?.fee_bps;
  const Icon = categoryIcon(order.category.icon);

  /** BJ11 "Ha, yo'lga chiqdim": permission request, then depart, then the BJ12 live map. */
  const doDepart = async () => {
    // The send interval is a setting (CLAUDE.md rule 7): load it, never guess it.
    const cfg = config.data ?? (await config.refetch()).data;
    if (!cfg) {
      showNotice(errorText(config.error));
      return;
    }
    const granted = await requestShareLocationPermissions();
    const done = await run('depart', () =>
      endpoints.orderStep(order.id, 'depart', { share_location: granted }),
    );
    if (done && granted) {
      await startTripTracking(order.id, {
        intervalSec: cfg.location_interval_sec,
        notificationTitle: t('trip.notification.title'),
        notificationBody: t('trip.notification.body'),
      });
    }
    if (done) router.push({ pathname: '/order/[id]/trip', params: { id: order.id } });
  };

  /** BJ11 is shown once ever; later departs go straight to the permission request. */
  const startDepart = () => {
    if (departIntroShown) void doDepart();
    else {
      setDepartIntroShown();
      setDepartOpen(true);
    }
  };

  const stepButton = (value: ExecutorStep) => {
    const labels = {
      depart: 'job.depart',
      arrive: 'job.arrive',
      start: 'job.start',
      finish: 'job.finish',
    } as const;
    return (
      <Button
        title={t(labels[value])}
        icon={value === 'finish' ? CircleCheck : Check}
        loading={busy === value}
        disabled={busy !== null}
        onPress={() => {
          if (value === 'finish') setFinishOpen(true);
          else if (value === 'depart') startDepart();
          else void run(value, () => endpoints.orderStep(order.id, value));
        }}
      />
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg2 }}>
      <BarHeader
        title={t('order.title', { number: order.number })}
        subtitle={
          open
            ? t('job.postedAgo', { ago: texts.ago(order.timeline.created_at) })
            : t(`jobStatus.${order.status}`)
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
        {mine ? (
          <PartyCard
            order={order}
            firstName={order.customer.first_name}
            lastName={order.customer.last_initial ? `${order.customer.last_initial}.` : ''}
            subtitle={t('job.customer')}
            phone={order.customer.phone}
          />
        ) : null}

        <Card>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            <Tag
              label={texts.category(order.category)}
              icon={Icon}
              iconColor={order.category.color}
            />
            <PaymentTag method={order.payment_method} long />
          </View>
          <AppText size="titleLarge" weight="bold">
            {order.title}
          </AppText>
          <AppText>
            <AppText size="amountLarge" weight="bold">
              {texts.amount(order.price)}
            </AppText>
            <AppText size="title" weight="semibold">{` ${t('common.currency')}`}</AppText>
          </AppText>
          {order.description ? (
            <AppText size="bodyLarge" color="text2">
              {order.description}
            </AppText>
          ) : null}
          <PhotoStrip urls={order.photos} />
        </Card>

        <Card style={{ gap: 0, paddingVertical: theme.spacing.xs }}>
          <InfoRow
            icon={MapPin}
            right={order.distance_m === null ? undefined : texts.km(order.distance_m)}
          >
            {texts.fullAddress(order.address)}
          </InfoRow>
          {mine && step !== null && step !== 'finish' && step !== 'start' ? (
            <Button
              variant="link"
              icon={Navigation}
              title={t('job.openInMaps')}
              onPress={() => openDirections(order.address.lat, order.address.lng)}
              style={{ alignSelf: 'flex-start', paddingHorizontal: 40 }}
            />
          ) : null}
          <Separator inset={40} />
          <InfoRow icon={Calendar}>{texts.range(order.time_from, order.time_to)}</InfoRow>
          {mine ? null : (
            <>
              <Separator inset={40} />
              <InfoRow icon={User}>
                {t('job.customerLine', {
                  name: texts.customerName(order.customer),
                  count: order.customer.orders_count,
                })}
              </InfoRow>
            </>
          )}
        </Card>

        {fee && feeBps !== undefined && feeBps !== null ? (
          <Card title={t('job.settlement')}>
            <MoneyRow
              label={t(
                paymentKind(order.payment_method) === 'cash'
                  ? 'job.cashYouGet'
                  : 'job.onlineYouGet',
              )}
              value={texts.money(order.price)}
            />
            <MoneyRow
              // "demodan" only when the demo bonus covers the whole fee.
              label={t(BigInt(fee.fee_real) === 0n ? 'job.feeFromDemo' : 'job.fee', {
                percent: formatPercent(feeBps),
              })}
              value={texts.money(-BigInt(fee.fee))}
              color="red"
            />
            <Separator />
            <MoneyRow
              label={t('job.net')}
              value={texts.money(netIncome(order.price, fee.fee))}
              color="green"
              strong
            />
          </Card>
        ) : null}

        {mine ? <Timeline order={order} /> : null}
        <View style={{ height: theme.spacing.sm }} />
      </ScrollView>

      <Footer>
        <View style={{ gap: theme.spacing.md, paddingBottom: insets.bottom }}>
          {open ? (
            <>
              {preview.data?.sufficient ? (
                <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
                  <CircleCheck size={24} color={theme.colors.green} />
                  <AppText color="text2" style={{ flex: 1 }}>
                    <Trans
                      i18nKey="job.enough"
                      values={{
                        fee: texts.amount(preview.data.fee),
                        available: texts.amount(preview.data.available),
                      }}
                      components={{ b: <AppText weight="bold" color="green" /> }}
                    />
                  </AppText>
                </View>
              ) : null}
              <Button
                title={t('job.accept')}
                icon={Check}
                loading={busy === 'accept'}
                onPress={() => void run('accept', () => endpoints.acceptOrder(order.id))}
              />
            </>
          ) : step ? (
            <>
              {stepButton(step)}
              {canDecline(order.status) ? (
                <Button
                  variant="link"
                  title={t('job.decline')}
                  disabled={busy !== null}
                  onPress={() => setDeclineOpen(true)}
                />
              ) : null}
            </>
          ) : mine && hasPaymentQr(order) ? (
            <Button
              icon={QrCode}
              title={t('job.takePayment')}
              onPress={() => router.push({ pathname: '/order/[id]/qr', params: { id: order.id } })}
            />
          ) : mine && awaitsOnlinePayment(order) ? (
            <AppText color="text2" style={{ textAlign: 'center' }}>
              {t('job.waitingOnline')}
            </AppText>
          ) : mine && awaitsExecutorReceived(order) ? (
            <>
              <Button
                icon={Check}
                title={t('payment.iReceived')}
                onPress={() =>
                  router.push({ pathname: '/order/[id]/confirm', params: { id: order.id } })
                }
              />
              <DangerLink
                icon={CircleX}
                label={t('payment.notReceived')}
                onPress={() => setDisputeOpen(true)}
              />
            </>
          ) : mine && order.status === 'DONE_BY_EXECUTOR' ? (
            <AppText color="text2" style={{ textAlign: 'center' }}>
              {t('job.waitingPayment')}
            </AppText>
          ) : mine && order.status === 'PAID' && order.fee ? (
            <AppText color="text2" style={{ textAlign: 'center' }}>
              {t('payment.feeCharged', { fee: texts.amount(order.fee.fee) })}
            </AppText>
          ) : mine && order.status === 'DISPUTED' ? (
            <AppText color="text2" style={{ textAlign: 'center' }}>
              {t('confirm.disputed')}
            </AppText>
          ) : (
            <AppText color="text2" style={{ textAlign: 'center' }}>
              {t(`jobStatus.${order.status}`)}
            </AppText>
          )}
        </View>
      </Footer>

      <DepartSheet
        visible={departOpen}
        customerName={texts.customerName(order.customer)}
        busy={busy === 'depart'}
        onClose={() => setDepartOpen(false)}
        onConfirm={() => {
          setDepartOpen(false);
          void doDepart();
        }}
      />
      <InsufficientSheet value={shortfall} onClose={() => setShortfall(null)} />
      <ConfirmBlockSheet orderId={blockingOrder} onClose={() => setBlockingOrder(null)} />
      {mine && canDispute(order.status) ? (
        <DisputeSheet
          visible={disputeOpen}
          executor
          busy={actions.busy === 'dispute'}
          onClose={() => setDisputeOpen(false)}
          onConfirm={(note) => void actions.dispute(note).then(() => setDisputeOpen(false))}
        />
      ) : null}
      <ConfirmSheet
        visible={declineOpen}
        title={t('job.declineConfirm')}
        confirmLabel={t('job.decline')}
        danger
        busy={busy === 'decline'}
        onClose={() => setDeclineOpen(false)}
        onConfirm={() =>
          void run('decline', () => endpoints.declineOrder(order.id)).then((done) => {
            setDeclineOpen(false);
            if (done) router.back();
          })
        }
      />
      <FinishSheet
        visible={finishOpen}
        busy={busy === 'finish'}
        onClose={() => setFinishOpen(false)}
        onConfirm={(photoKeys) =>
          void run('finish', () => endpoints.finishOrder(order.id, photoKeys)).then((done) => {
            if (done) setFinishOpen(false);
          })
        }
      />
    </View>
  );
}

function InfoRow({
  icon: Icon,
  right,
  children,
}: {
  icon: LucideIcon;
  right?: string;
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.lg,
        paddingVertical: theme.spacing.md,
      }}
    >
      <Icon size={24} color={theme.colors.text2} />
      <AppText size="bodyLarge" style={{ flex: 1 }}>
        {children}
      </AppText>
      {right ? <AppText color="text2">{right}</AppText> : null}
    </View>
  );
}

function MoneyRow({
  label,
  value,
  color = 'text',
  strong = false,
}: {
  label: string;
  value: string;
  color?: 'text' | 'red' | 'green';
  strong?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
      <AppText
        size="bodyLarge"
        weight={strong ? 'bold' : 'regular'}
        color={strong ? 'text' : 'text2'}
        style={{ flex: 1 }}
      >
        {label}
      </AppText>
      <AppText size={strong ? 'bar' : 'bodyLarge'} weight="bold" color={color}>
        {value}
      </AppText>
    </View>
  );
}
