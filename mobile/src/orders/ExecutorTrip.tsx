import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Circle, Flag, MapPin, Navigation } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { endpoints } from '../api/endpoints';
import { invalidateOrder, queryKeys, useOrderTrip } from '../api/queries';
import type { Order } from '../api/types';
import { useErrorText } from '../api/use-error-text';
import { AppText } from '../components/AppText';
import { BarHeader } from '../components/ui/BarHeader';
import { Button } from '../components/ui/Button';
import { ConfirmSheet } from '../components/ui/ConfirmSheet';
import { useLiveDeviceLocation } from '../lib/location';
import { openDirections } from '../lib/maps';
import { showNotice } from '../lib/notice';
import { stopTripTracking } from '../location/trip-task';
import { useRealtime } from '../realtime/socket';
import { useTheme } from '../theme/ThemeProvider';
import { TripMap } from './map/TripMap';
import { PartyCard } from './PartyCard';
import { useOrderTexts } from './texts';

/** BJ12 "Manzilga yo'l": the pro's own live map while `EN_ROUTE`. */
export function ExecutorTrip({ order }: { order: Order }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const errorText = useErrorText();
  const client = useQueryClient();
  const texts = useOrderTexts();

  const [busy, setBusy] = useState<'arrive' | 'stop' | null>(null);
  const [stopOpen, setStopOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  const active = order.status === 'EN_ROUTE';
  const trip = useOrderTrip(order.id, active);
  const sharing = trip.data?.status === 'ACTIVE';
  const position = useLiveDeviceLocation(sharing);

  const onEnded = useCallback(() => void trip.refetch(), [trip]);
  useRealtime('trip.ended', onEnded);

  const arrive = async () => {
    setBusy('arrive');
    try {
      await stopTripTracking();
      client.setQueryData(queryKeys.order(order.id), await endpoints.orderStep(order.id, 'arrive'));
      invalidateOrder(client, order.id);
      router.back();
    } catch (error) {
      showNotice(errorText(error));
    } finally {
      setBusy(null);
    }
  };

  const stopSharing = async () => {
    setBusy('stop');
    try {
      await stopTripTracking();
      client.setQueryData(queryKeys.trip(order.id), await endpoints.tripStop(order.id));
      setStopOpen(false);
    } catch (error) {
      showNotice(errorText(error));
    } finally {
      setBusy(null);
    }
  };

  const eta = trip.data?.eta_sec ?? null;
  const distance = trip.data?.distance_m ?? null;
  const arrivalClock = eta !== null ? texts.clock(new Date(now + eta * 1000).toISOString()) : null;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg2 }}>
      <BarHeader title={t('order.title', { number: order.number })} subtitle={order.title} />
      <View style={{ flex: 1 }}>
        <TripMap
          destination={{ lat: order.address.lat, lng: order.address.lng }}
          position={position}
        />
        <View
          style={{
            position: 'absolute',
            top: theme.spacing.md,
            left: theme.spacing.lg,
            right: theme.spacing.lg,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              alignSelf: 'flex-start',
              gap: theme.spacing.sm,
              paddingHorizontal: theme.spacing.lg,
              paddingVertical: theme.spacing.sm,
              borderRadius: 999,
              backgroundColor: theme.colors.pillBg,
              elevation: 3,
            }}
          >
            <Circle
              size={10}
              color={sharing ? theme.colors.green : theme.colors.text2}
              fill={sharing ? theme.colors.green : theme.colors.text2}
            />
            <AppText weight="semibold" style={{ color: theme.colors.pillText }}>
              {t(sharing ? 'trip.sharing' : 'trip.notSharing')}
            </AppText>
            {sharing ? (
              <Pressable accessibilityRole="button" onPress={() => setStopOpen(true)} hitSlop={8}>
                <AppText
                  weight="semibold"
                  style={{ color: theme.colors.brandText, textDecorationLine: 'underline' }}
                >
                  {t('trip.stopSharing')}
                </AppText>
              </Pressable>
            ) : null}
          </View>
        </View>
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
        {eta !== null ? (
          <View>
            <AppText size="titleLarge" weight="bold">
              {t('trip.proEta', {
                min: Math.round(eta / 60),
                km: distance !== null ? texts.km(distance) : '—',
              })}
            </AppText>
            {arrivalClock ? (
              <AppText color="text2">{t('trip.proEtaSub', { time: arrivalClock })}</AppText>
            ) : null}
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', gap: theme.spacing.md, alignItems: 'flex-start' }}>
          <MapPin size={20} color={theme.colors.text2} style={{ marginTop: 2 }} />
          <AppText size="bodyLarge" style={{ flex: 1 }}>
            {texts.fullAddress(order.address)}
          </AppText>
        </View>

        <PartyCard
          order={order}
          firstName={order.customer.first_name}
          lastName={order.customer.last_initial ? `${order.customer.last_initial}.` : ''}
          subtitle={t('job.customer')}
          phone={order.customer.phone}
        />

        <Button
          variant="secondary"
          icon={Navigation}
          title={t('job.openInMaps')}
          onPress={() => openDirections(order.address.lat, order.address.lng)}
        />
        <Button
          icon={Flag}
          title={t('job.arrive')}
          loading={busy === 'arrive'}
          disabled={busy !== null}
          onPress={() => void arrive()}
        />
      </View>

      <ConfirmSheet
        visible={stopOpen}
        title={t('trip.stopConfirmTitle')}
        confirmLabel={t('trip.stopSharing')}
        danger
        busy={busy === 'stop'}
        onClose={() => setStopOpen(false)}
        onConfirm={() => void stopSharing()}
      />
    </View>
  );
}
