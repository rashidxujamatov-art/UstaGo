import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAdminDisputes, useSaDisputesPendingApproval } from '../api/queries';
import type { DisputeListFilter, DisputeListItem } from '../api/types';
import { useErrorText } from '../api/use-error-text';
import { AppText } from '../components/AppText';
import { BarHeader } from '../components/ui/BarHeader';
import { Button } from '../components/ui/Button';
import { Segmented } from '../components/ui/Segmented';
import { Tag } from '../components/ui/Chip';
import { formatOrderNumber } from '../lib/format';
import { PaymentTag } from '../orders/PaymentTag';
import { useOrderTexts } from '../orders/texts';
import { isSuperAdmin } from './permissions';
import { useSession } from '../store/session';
import { useTheme } from '../theme/ThemeProvider';

type Tab = 'OPEN' | 'DECIDED' | 'PENDING_APPROVAL';

/** AD3 list: open, decided, and (super admin) the "Super admin tasdiqlaydi" inbox. */
export function Disputes() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const errorText = useErrorText();
  const user = useSession((state) => state.user);
  const superAdmin = user ? isSuperAdmin(user) : false;
  const [tab, setTab] = useState<Tab>('OPEN');

  const status: DisputeListFilter | undefined = tab === 'DECIDED' ? 'DECIDED' : 'OPEN';
  const openList = useAdminDisputes(status);
  const pendingList = useSaDisputesPendingApproval();
  const list = tab === 'PENDING_APPROVAL' ? pendingList : openList;
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg2 }}>
      <BarHeader title={t('admin.disputesTitle')} />
      <View style={{ padding: theme.spacing.lg }}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'OPEN', label: t('admin.disputesFilterOpen') },
            { value: 'DECIDED', label: t('admin.disputesFilterDecided') },
            ...(superAdmin
              ? [{ value: 'PENDING_APPROVAL' as const, label: t('admin.disputesFilterPending') }]
              : []),
          ]}
        />
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <DisputeRow item={item} />}
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
              {t('admin.disputesEmpty')}
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

function DisputeRow({ item }: { item: DisputeListItem }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const texts = useOrderTexts();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/admin/disputes/[id]', params: { id: item.id } })}
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
          <AppText size="bodyLarge" weight="bold">
            {t('admin.disputeTitle', { number: formatOrderNumber(item.number) })}
          </AppText>
          <PaymentTag method={item.payment_method} />
        </View>
        <AppText color="text2">{texts.money(item.price)}</AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          {item.decision ? (
            <Tag
              label={t(
                item.decision === 'PARTIAL'
                  ? 'admin.disputeDecisionPARTIALShort'
                  : `admin.disputeDecision${item.decision}`,
              )}
              tone="brand"
            />
          ) : null}
          {item.approval === 'PENDING' ? (
            <Tag label={t('admin.disputeApprovalPENDING')} tone="orange" />
          ) : null}
        </View>
      </View>
      <ChevronRight size={22} color={theme.colors.text2} />
    </Pressable>
  );
}
