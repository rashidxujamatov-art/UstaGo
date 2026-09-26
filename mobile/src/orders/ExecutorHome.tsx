import { router } from 'expo-router';
import { ChevronRight, Gift, MapPin } from 'lucide-react-native';
import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type FeedFilter, useConfig, useFeed, useMyJobs, useWallet } from '../api/queries';
import type { Order } from '../api/types';
import { useErrorText } from '../api/use-error-text';
import { AppText } from '../components/AppText';
import { HomeHeader } from '../components/HomeHeader';
import { Button } from '../components/ui/Button';
import { Chip, Tag } from '../components/ui/Chip';
import { kmValue } from '../lib/time';
import { useDeviceLocation } from '../lib/location';
import { useSession } from '../store/session';
import { useTheme } from '../theme/ThemeProvider';
import { CategoryIcon } from './CategoryIcon';
import { PaymentTag } from './PaymentTag';
import { isNewJob, statusColor } from './status';
import { useOrderTexts } from './texts';
import { showNotice } from '../lib/notice';

type Tab = 'new' | 'mine' | 'history';
type FilterKey = 'all' | 'nearby' | 'cash' | 'online';

const FILTERS: Record<FilterKey, FeedFilter> = {
  all: {},
  nearby: { nearby: true },
  cash: { payment: 'cash' },
  online: { payment: 'online' },
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** BJ1: new jobs, the executor's active jobs and history. */
export function ExecutorHome({
  onMenu,
  initialTab = 'new',
}: {
  onMenu: () => void;
  initialTab?: Tab;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const errorText = useErrorText();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [filter, setFilter] = useState<FilterKey>('all');
  const location = useDeviceLocation();
  const config = useConfig();

  const feed = useFeed(FILTERS[filter], location.coords);
  const mine = useMyJobs('active');
  const history = useMyJobs('history');
  const query = tab === 'new' ? feed : tab === 'mine' ? mine : history;
  const list = query.data ?? [];

  const chooseFilter = async (key: FilterKey) => {
    if (key === 'nearby' && !location.coords) {
      const granted = location.permission !== 'denied' && (await location.request());
      if (!granted) {
        showNotice(t('executorHome.locationHint'));
        return;
      }
    }
    setFilter(key);
  };

  const radiusKm = config.data ? kmValue(config.data.feed_nearby_radius_m).replace(/\.0$/, '') : '';

  const header =
    tab === 'new' ? (
      <View style={{ gap: theme.spacing.md, paddingBottom: theme.spacing.md }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ backgroundColor: theme.colors.bg }}
          contentContainerStyle={{
            gap: theme.spacing.sm,
            padding: theme.spacing.lg,
            paddingVertical: theme.spacing.md,
          }}
        >
          <Chip
            label={t('executorHome.filterAll')}
            selected={filter === 'all'}
            onPress={() => void chooseFilter('all')}
          />
          {radiusKm ? (
            <Chip
              label={t('executorHome.filterNearby', { km: radiusKm })}
              icon={MapPin}
              selected={filter === 'nearby'}
              onPress={() => void chooseFilter('nearby')}
            />
          ) : null}
          <Chip
            label={t('executorHome.filterCash')}
            selected={filter === 'cash'}
            onPress={() => void chooseFilter('cash')}
          />
          <Chip
            label={t('executorHome.filterOnline')}
            selected={filter === 'online'}
            onPress={() => void chooseFilter('online')}
          />
        </ScrollView>
        <FreePeriodBanner />
        {!location.coords && location.permission !== 'denied' ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => void location.request()}
            style={{
              marginHorizontal: theme.spacing.lg,
              minHeight: theme.size.touchTarget,
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.sm,
            }}
          >
            <MapPin size={20} color={theme.colors.brandText} />
            <AppText color="brandText" weight="semibold" style={{ flex: 1 }}>
              {t('executorHome.locationHint')}
            </AppText>
          </Pressable>
        ) : null}
      </View>
    ) : (
      <View style={{ height: theme.spacing.md }} />
    );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg2 }}>
      <HomeHeader
        roleLabel={t('role.executorShort')}
        onMenu={onMenu}
        tab={tab}
        onTab={setTab}
        tabs={[
          { value: 'new', label: t('executorHome.tabNew'), count: feed.data?.length },
          { value: 'mine', label: t('executorHome.tabMine'), count: mine.data?.length },
          { value: 'history', label: t('executorHome.tabHistory') },
        ]}
      />
      <FlatList
        data={list}
        keyExtractor={(order) => order.id}
        ListHeaderComponent={header}
        renderItem={({ item }) => <JobCard order={item} showStatus={tab !== 'new'} />}
        ItemSeparatorComponent={() => <View style={{ height: theme.spacing.md }} />}
        ListEmptyComponent={
          query.isPending ? (
            <ActivityIndicator style={{ margin: theme.spacing.xxl }} color={theme.colors.brand} />
          ) : query.isError ? (
            <View style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
              <AppText color="red">{errorText(query.error)}</AppText>
              <Button
                variant="secondary"
                title={t('common.retry')}
                onPress={() => void query.refetch()}
              />
            </View>
          ) : (
            <AppText color="text2" style={{ padding: theme.spacing.lg, textAlign: 'center' }}>
              {t(
                tab === 'new'
                  ? 'executorHome.emptyNew'
                  : tab === 'mine'
                    ? 'executorHome.emptyMine'
                    : 'executorHome.emptyHistory',
              )}
            </AppText>
          )
        }
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
            tintColor={theme.colors.brand}
          />
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + theme.spacing.xl }}
      />
    </View>
  );
}

/** Orange banner while the free period lasts (BJ1). */
function FreePeriodBanner() {
  const theme = useTheme();
  const texts = useOrderTexts();
  const executor = useSession((state) => state.user?.executor);
  const wallet = useWallet();
  const [openedAt] = useState(() => Date.now());

  const daysLeft = executor
    ? Math.ceil((new Date(executor.free_period_end).getTime() - openedAt) / DAY_MS)
    : 0;
  if (daysLeft <= 0 || !wallet.data) return null;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push('/soon')}
      style={{
        marginHorizontal: theme.spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        padding: theme.spacing.lg,
        borderRadius: theme.radius.card,
        backgroundColor: theme.colors.orangeSoft,
      }}
    >
      <Gift size={26} color={theme.colors.orange} />
      <AppText color="orange" size="bodyLarge" style={{ flex: 1 }}>
        <Trans
          i18nKey="executorHome.freeBanner"
          values={{ days: daysLeft, amount: texts.amount(wallet.data.demo) }}
          components={{ b: <AppText weight="bold" size="bodyLarge" color="orange" /> }}
        />
      </AppText>
      <ChevronRight size={22} color={theme.colors.orange} />
    </Pressable>
  );
}

function JobCard({ order, showStatus }: { order: Order; showStatus: boolean }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const texts = useOrderTexts();
  const where = [
    order.address.text,
    order.distance_m === null ? null : texts.km(order.distance_m),
    texts.startsAt(order.time_from),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/order/[id]', params: { id: order.id } })}
      style={({ pressed }) => ({
        marginHorizontal: theme.spacing.md,
        flexDirection: 'row',
        gap: theme.spacing.md,
        padding: theme.spacing.lg,
        borderRadius: theme.radius.card,
        backgroundColor: pressed ? theme.colors.surface2 : theme.colors.surface,
      })}
    >
      <CategoryIcon category={order.category} size={48} square />
      <View style={{ flex: 1, gap: theme.spacing.sm }}>
        <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
          <AppText size="bodyLarge" weight="bold" style={{ flex: 1 }}>
            {order.title}
          </AppText>
          <AppText size="bodyLarge" weight="bold">
            {texts.amount(order.price)}
          </AppText>
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <MapPin size={18} color={theme.colors.text2} style={{ marginTop: 2 }} />
          <AppText color="text2" numberOfLines={2} style={{ flex: 1 }}>
            {where}
          </AppText>
        </View>
        {/* Wraps instead of truncating: long payment names (ru, tg) leave no room on one line. */}
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: theme.spacing.sm,
          }}
        >
          <PaymentTag method={order.payment_method} />
          {!showStatus && isNewJob(order.timeline.created_at) ? (
            <Tag label={t('executorHome.newChip')} tone="green" />
          ) : null}
          {showStatus ? (
            <AppText
              size="secondary"
              weight="semibold"
              color={statusColor(order.status)}
              style={{ marginLeft: 'auto' }}
            >
              {t(`jobStatus.${order.status}`)}
            </AppText>
          ) : (
            <AppText size="secondary" color="text2" style={{ marginLeft: 'auto' }}>
              {texts.ago(order.timeline.created_at)}
            </AppText>
          )}
        </View>
      </View>
    </Pressable>
  );
}
