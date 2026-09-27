import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { CircleCheck, EyeOff } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { queryKeys, useOrderTrip } from '../api/queries';
import type { Order, TripEndReason, TripView } from '../api/types';
import { AppText } from '../components/AppText';
import { BarHeader } from '../components/ui/BarHeader';
import { Button } from '../components/ui/Button';
import { useRealtime } from '../realtime/socket';
import { useTheme } from '../theme/ThemeProvider';
import { TripMap } from './map/TripMap';
import { PartyCard } from './PartyCard';
import { useOrderTexts } from './texts';

type Stage = 'accepted' | 'enroute' | 'arrived';
const STAGES: Stage[] = ['accepted', 'enroute', 'arrived'];

function TripSteps({ stage }: { stage: Stage }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const index = STAGES.indexOf(stage);
  return (
    <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
      {STAGES.map((key, i) => {
        const done = i < index || stage === 'arrived';
        const current = i === index && stage !== 'arrived';
        return (
          <View key={key} style={{ flex: 1, gap: 4 }}>
            <View
              style={{
                height: 4,
                borderRadius: 2,
                backgroundColor: done
                  ? theme.colors.green
                  : current
                    ? theme.colors.brand
                    : theme.colors.sep,
              }}
            />
            <AppText
              size="secondary"
              weight={current ? 'bold' : 'regular'}
              color={done ? 'green' : current ? 'brandText' : 'text2'}
            >
              {t(`trip.step.${key}`)}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

/** BY7 "Usta yo'lda" and BY8 "Usta yetib keldi": the customer's live trip screen. */
export function CustomerTrip({ order }: { order: Order }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const texts = useOrderTexts();
  const client = useQueryClient();

  const enabled = order.status === 'EN_ROUTE' || order.status === 'ARRIVED';
  const trip = useOrderTrip(order.id, enabled);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  const onPosition = useCallback(
    (payload: {
      order_id: string;
      lat: number;
      lng: number;
      heading: number | null;
      at: string;
    }) => {
      if (payload.order_id !== order.id) return;
      client.setQueryData(queryKeys.trip(order.id), (previous?: TripView) =>
        previous
          ? {
              ...previous,
              status: 'ACTIVE' as const,
              position: {
                lat: payload.lat,
                lng: payload.lng,
                heading: payload.heading,
                at: payload.at,
              },
            }
          : previous,
      );
    },
    [client, order.id],
  );
  const onEta = useCallback(
    (payload: { order_id: string; eta_sec: number; distance_m: number }) => {
      if (payload.order_id !== order.id) return;
      client.setQueryData(queryKeys.trip(order.id), (previous?: TripView) =>
        previous
          ? { ...previous, eta_sec: payload.eta_sec, distance_m: payload.distance_m }
          : previous,
      );
    },
    [client, order.id],
  );
  const onEnded = useCallback(
    (payload: { order_id: string; reason: TripEndReason }) => {
      if (payload.order_id !== order.id) return;
      void trip.refetch();
    },
    [order.id, trip],
  );
  useRealtime('trip.position', onPosition);
  useRealtime('trip.eta', onEta);
  useRealtime('trip.ended', onEnded);

  const data = trip.data;
  const arrived = order.status === 'ARRIVED';
  const shared = !!data && data.status !== 'NONE';
  const sharing = data?.status === 'ACTIVE';
  const secondsAgo =
    sharing && data?.position
      ? Math.max(0, Math.round((now - new Date(data.position.at).getTime()) / 1000))
      : null;

  const eta = data?.eta_sec ?? null;
  const distance = data?.distance_m ?? null;
  const arrivalClock = eta !== null ? texts.clock(new Date(now + eta * 1000).toISOString()) : null;
  const stage: Stage = arrived ? 'arrived' : 'enroute';

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg2 }}>
      <BarHeader
        title={t(arrived ? 'trip.arrivedHeader' : 'trip.enRouteHeader')}
        subtitle={t('order.title', { number: order.number })}
      />
      <View style={{ flex: 1 }}>
        <TripMap
          destination={data?.destination ?? order.address}
          position={sharing ? (data?.position ?? null) : null}
        />
      </View>

      <View
        style={{
          borderTopLeftRadius: theme.radius.sheet,
          borderTopRightRadius: theme.radius.sheet,
          backgroundColor: theme.colors.bg,
          padding: theme.spacing.xl,
          paddingBottom: insets.bottom + theme.spacing.lg,
          gap: theme.spacing.md,
          elevation: 6,
        }}
      >
        {arrived ? (
          <View style={{ flexDirection: 'row', gap: theme.spacing.md, alignItems: 'center' }}>
            <CircleCheck size={40} color={theme.colors.green} />
            <View style={{ flex: 1 }}>
              <AppText size="title" weight="bold">
                {t('trip.arrivedHeader')}
              </AppText>
              {order.executor ? (
                <AppText color="text2">
                  {t('trip.arrivedSub', {
                    name: texts.executorShort(order.executor),
                    when: texts.clock(order.timeline.arrived_at ?? order.timeline.created_at),
                  })}
                </AppText>
              ) : null}
            </View>
          </View>
        ) : sharing && secondsAgo !== null ? (
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: theme.colors.green,
                }}
              />
              <AppText size="secondary" weight="semibold" color="green">
                {t('trip.freshness', { sec: secondsAgo })}
              </AppText>
            </View>
            {eta !== null ? (
              <AppText size="titleLarge" weight="bold">
                {t('trip.eta', { min: Math.round(eta / 60) })}
              </AppText>
            ) : null}
            {distance !== null && arrivalClock ? (
              <AppText color="text2">
                {t('trip.etaSub', { km: texts.km(distance), time: arrivalClock })}
              </AppText>
            ) : null}
          </View>
        ) : (
          <AppText size="bodyLarge" weight="semibold" color="text2">
            {t('trip.notShared')}
          </AppText>
        )}

        <TripSteps stage={stage} />

        {order.executor ? (
          <PartyCard
            order={order}
            firstName={order.executor.first_name}
            lastName={order.executor.last_name}
            subtitle={texts.category(order.category)}
            phone={order.executor.phone}
          />
        ) : null}

        {arrived ? (
          <>
            <View
              style={{
                flexDirection: 'row',
                gap: theme.spacing.md,
                alignItems: 'flex-start',
                padding: theme.spacing.lg,
                borderRadius: theme.radius.card,
                backgroundColor: theme.colors.surface2,
              }}
            >
              <EyeOff size={20} color={theme.colors.text2} style={{ marginTop: 2 }} />
              <AppText color="text2" style={{ flex: 1 }}>
                {t('trip.trackingStoppedNote')}
              </AppText>
            </View>
            <Button title={t('trip.backToOrder')} onPress={() => router.back()} />
          </>
        ) : shared ? (
          <AppText color="text2" style={{ textAlign: 'center' }}>
            {t('trip.autoStopNote')}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}
