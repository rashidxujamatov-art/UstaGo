import { router } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCategories, useMyOrders } from '../api/queries';
import type { Order } from '../api/types';
import { useErrorText } from '../api/use-error-text';
import { AppText } from '../components/AppText';
import { HomeHeader } from '../components/HomeHeader';
import { Button } from '../components/ui/Button';
import { useOrderDraft } from '../store/order-draft';
import { useTheme } from '../theme/ThemeProvider';
import { CategoryIcon } from './CategoryIcon';
import { ACTIVE_STATUSES, FINISHED_STATUSES, statusColor } from './status';
import { useOrderTexts } from './texts';

type Tab = 'all' | 'active' | 'finished';

/** BY1: the customer's home with categories and their orders. */
export function CustomerHome({
  onMenu,
  initialTab = 'all',
}: {
  onMenu: () => void;
  initialTab?: Tab;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const errorText = useErrorText();
  const [tab, setTab] = useState<Tab>(initialTab);
  const orders = useMyOrders();
  const categories = useCategories();
  const texts = useOrderTexts();

  const all = useMemo(() => orders.data ?? [], [orders.data]);
  const active = useMemo(() => all.filter((o) => ACTIVE_STATUSES.includes(o.status)), [all]);
  const finished = useMemo(() => all.filter((o) => FINISHED_STATUSES.includes(o.status)), [all]);
  const list = tab === 'active' ? active : tab === 'finished' ? finished : all;

  const newOrder = (categoryId?: string) => {
    if (categoryId) useOrderDraft.getState().set({ categoryId });
    router.push('/order/new');
  };

  const header = (
    <View>
      <View style={{ paddingVertical: theme.spacing.lg, gap: theme.spacing.md }}>
        <AppText
          size="bodyLarge"
          weight="bold"
          color="brandText"
          style={{ paddingHorizontal: theme.spacing.lg }}
        >
          {t('customerHome.whatPro')}
        </AppText>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: theme.spacing.sm }}
        >
          {(categories.data ?? []).map((category) => (
            <Pressable
              key={category.id}
              accessibilityRole="button"
              accessibilityLabel={texts.category(category)}
              onPress={() => newOrder(category.id)}
              style={{ width: 84, alignItems: 'center', gap: theme.spacing.sm }}
            >
              <CategoryIcon category={category} size={60} />
              <AppText size="secondaryLarge" numberOfLines={1} style={{ maxWidth: 84 }}>
                {texts.category(category)}
              </AppText>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      <View style={{ height: 1, backgroundColor: theme.colors.sep }} />
      <AppText
        size="bodyLarge"
        weight="bold"
        color="brandText"
        style={{ paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg }}
      >
        {t('customerHome.myOrders')}
      </AppText>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <HomeHeader
        roleLabel={t('role.customer')}
        onMenu={onMenu}
        tab={tab}
        onTab={setTab}
        tabs={[
          { value: 'all', label: t('customerHome.tabAll'), count: all.length },
          { value: 'active', label: t('customerHome.tabActive'), count: active.length },
          { value: 'finished', label: t('customerHome.tabFinished') },
        ]}
      />
      <FlatList
        data={list}
        keyExtractor={(order) => order.id}
        ListHeaderComponent={header}
        renderItem={({ item, index }) => <OrderRow order={item} last={index === list.length - 1} />}
        ListEmptyComponent={
          orders.isPending ? (
            <ActivityIndicator style={{ margin: theme.spacing.xxl }} color={theme.colors.brand} />
          ) : orders.isError ? (
            <View style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
              <AppText color="red">{errorText(orders.error)}</AppText>
              <Button
                variant="secondary"
                title={t('common.retry')}
                onPress={() => void orders.refetch()}
              />
            </View>
          ) : (
            <AppText color="text2" style={{ padding: theme.spacing.lg }}>
              {t('customerHome.empty')}
            </AppText>
          )
        }
        refreshControl={
          <RefreshControl
            refreshing={orders.isRefetching}
            onRefresh={() => void orders.refetch()}
            tintColor={theme.colors.brand}
          />
        }
        contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
      />

      <Pressable
        accessibilityRole="button"
        onPress={() => newOrder()}
        style={({ pressed }) => ({
          position: 'absolute',
          right: theme.spacing.lg,
          bottom: insets.bottom + theme.spacing.xl,
          minHeight: 60,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          paddingHorizontal: theme.spacing.xxl,
          borderRadius: 999,
          backgroundColor: theme.colors.brand,
          opacity: pressed ? 0.85 : 1,
          elevation: 4,
          shadowColor: theme.colors.scrim,
          shadowOpacity: 0.2,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 3 },
        })}
      >
        <Plus size={26} color={theme.colors.barText} />
        <AppText size="bodyLarge" weight="bold" style={{ color: theme.colors.barText }}>
          {t('customerHome.newOrder')}
        </AppText>
      </Pressable>
    </View>
  );
}

function OrderRow({ order, last }: { order: Order; last: boolean }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const texts = useOrderTexts();

  const detail =
    order.status === 'CANCELLED'
      ? t(
          order.cancel?.by_me
            ? 'customerHome.cancelledByMe'
            : order.cancel?.by_system
              ? 'customerHome.cancelledExpired'
              : 'customerHome.cancelledOther',
        )
      : order.executor && order.status !== 'PAID'
        ? texts.executorShort(order.executor)
        : texts.money(order.price);
  const stamps = Object.values(order.timeline).filter((value): value is string => Boolean(value));
  const updatedAt = stamps.sort().at(-1) ?? order.timeline.created_at;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/order/[id]', params: { id: order.id } })}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.lg,
        paddingLeft: theme.spacing.lg,
        backgroundColor: pressed ? theme.colors.surface2 : 'transparent',
      })}
    >
      <CategoryIcon category={order.category} size={54} />
      <View
        style={{
          flex: 1,
          paddingVertical: theme.spacing.lg,
          paddingRight: theme.spacing.lg,
          gap: 2,
          borderBottomWidth: last ? 0 : 1,
          borderBottomColor: theme.colors.sep,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: theme.spacing.sm }}>
          <AppText size="bodyLarge" weight="bold" numberOfLines={1} style={{ flex: 1 }}>
            {order.title}
          </AppText>
          <AppText size="secondary" color="text2">
            {texts.listTime(updatedAt)}
          </AppText>
        </View>
        <AppText numberOfLines={1}>
          <AppText weight="semibold" color={statusColor(order.status)}>
            {t(`orderStatus.${order.status}`)}
          </AppText>
          <AppText color="text2">{` · ${detail}`}</AppText>
        </AppText>
      </View>
    </Pressable>
  );
}
