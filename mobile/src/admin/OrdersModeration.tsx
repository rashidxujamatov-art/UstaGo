import { router } from 'expo-router';
import { ChevronRight, Search, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAdminOrders } from '../api/queries';
import type { Order } from '../api/types';
import { useErrorText } from '../api/use-error-text';
import { AppText } from '../components/AppText';
import { BarHeader } from '../components/ui/BarHeader';
import { Button } from '../components/ui/Button';
import { Segmented } from '../components/ui/Segmented';
import { formatOrderNumber } from '../lib/format';
import { PaymentTag } from '../orders/PaymentTag';
import { statusColor } from '../orders/status';
import { useOrderTexts } from '../orders/texts';
import { useTheme } from '../theme/ThemeProvider';

type Tab = 'ALL' | 'STUCK';

/** Orders moderation (`orders.moderate`): search, the "kechikkan" filter, view any order. */
export function OrdersModeration({ initialStuck = false }: { initialStuck?: boolean }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const errorText = useErrorText();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>(initialStuck ? 'STUCK' : 'ALL');

  const filter = useMemo(
    () => ({ search: search.trim() || undefined, stuck: tab === 'STUCK' || undefined }),
    [search, tab],
  );
  const list = useAdminOrders(filter);
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg2 }}>
      <BarHeader title={t('admin.ordersTitle')} />
      <View style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            minHeight: theme.size.buttonSecondary,
            paddingHorizontal: theme.spacing.md,
            borderRadius: theme.radius.lg,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.bg,
          }}
        >
          <Search size={20} color={theme.colors.text2} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t('admin.ordersSearchPlaceholder')}
            placeholderTextColor={theme.colors.text2}
            accessibilityLabel={t('admin.ordersSearchPlaceholder')}
            style={{ flex: 1, paddingVertical: theme.spacing.sm, color: theme.colors.text }}
          />
          {search ? (
            <Pressable accessibilityRole="button" onPress={() => setSearch('')} hitSlop={8}>
              <X size={18} color={theme.colors.text2} />
            </Pressable>
          ) : null}
        </View>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'ALL', label: t('admin.ordersFilterAll') },
            { value: 'STUCK', label: t('admin.ordersFilterStuck') },
          ]}
        />
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <OrderRow item={item} />}
        ItemSeparatorComponent={() => <View style={{ height: theme.spacing.sm }} />}
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: insets.bottom + theme.spacing.xl,
        }}
        onEndReached={() => {
          if (list.hasNextPage) void list.fetchNextPage();
        }}
        ListEmptyComponent={
          list.isPending ? (
            <ActivityIndicator style={{ margin: theme.spacing.xxl }} color={theme.colors.brand} />
          ) : list.isError ? (
            <View style={{ gap: theme.spacing.md }}>
              <AppText color="red">{errorText(list.error)}</AppText>
              <Button
                variant="secondary"
                title={t('common.retry')}
                onPress={() => void list.refetch()}
              />
            </View>
          ) : (
            <AppText color="text2" style={{ textAlign: 'center', padding: theme.spacing.xxl }}>
              {t('admin.ordersEmpty')}
            </AppText>
          )
        }
        ListFooterComponent={
          list.isFetchingNextPage ? (
            <ActivityIndicator style={{ margin: theme.spacing.lg }} color={theme.colors.brand} />
          ) : null
        }
      />
    </View>
  );
}

function OrderRow({ item }: { item: Order }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const texts = useOrderTexts();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/admin/orders/[id]', params: { id: item.id } })}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        padding: theme.spacing.lg,
        borderRadius: theme.radius.card,
        backgroundColor: pressed ? theme.colors.surface2 : theme.colors.surface,
      })}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <AppText size="bodyLarge" weight="bold" numberOfLines={1} style={{ flex: 1 }}>
            {formatOrderNumber(item.number)} · {item.title}
          </AppText>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <AppText color={statusColor(item.status)} weight="semibold" size="secondary">
            {t(`orderStatus.${item.status}`)}
          </AppText>
          <PaymentTag method={item.payment_method} />
        </View>
        <AppText color="text2">{texts.money(item.price)}</AppText>
      </View>
      <ChevronRight size={22} color={theme.colors.text2} />
    </Pressable>
  );
}
