import { router } from 'expo-router';
import { ChevronRight, Search, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAdminUsers } from '../api/queries';
import type { AdminUserListItem, Role } from '../api/types';
import { useErrorText } from '../api/use-error-text';
import { AppText } from '../components/AppText';
import { Avatar } from '../components/ui/Avatar';
import { BarHeader } from '../components/ui/BarHeader';
import { Button } from '../components/ui/Button';
import { Segmented } from '../components/ui/Segmented';
import { Tag } from '../components/ui/Chip';
import { initials } from '../lib/input';
import { useTheme } from '../theme/ThemeProvider';

export type RoleFilter = 'ALL' | Role;

/** AD2 "Foydalanuvchilar": search, role tabs, pending-verification and recent-activity lists. */
export function Users({ initialRole = 'ALL' }: { initialRole?: RoleFilter }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const errorText = useErrorText();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<RoleFilter>(initialRole);

  const filter = useMemo(
    () => ({ search: search.trim() || undefined, role: role === 'ALL' ? undefined : role }),
    [search, role],
  );
  const list = useAdminUsers(filter);
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const pending = items.filter((item) => item.tax?.status === 'PENDING');
  const rest = items.filter((item) => item.tax?.status !== 'PENDING');

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg2 }}>
      <BarHeader title={t('admin.usersTitle')} />
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
            placeholder={t('admin.usersSearchPlaceholder')}
            placeholderTextColor={theme.colors.text2}
            accessibilityLabel={t('admin.usersSearchPlaceholder')}
            style={{ flex: 1, paddingVertical: theme.spacing.sm, color: theme.colors.text }}
          />
          {search ? (
            <Pressable accessibilityRole="button" onPress={() => setSearch('')} hitSlop={8}>
              <X size={18} color={theme.colors.text2} />
            </Pressable>
          ) : null}
        </View>
        <Segmented
          value={role}
          onChange={setRole}
          options={[
            { value: 'ALL', label: t('admin.usersFilterAll') },
            { value: 'EXECUTOR', label: t('admin.usersFilterExecutors') },
            { value: 'CUSTOMER', label: t('admin.usersFilterCustomers') },
          ]}
        />
      </View>
      <FlatList
        data={rest}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <UserRow item={item} />}
        ItemSeparatorComponent={() => <View style={{ height: theme.spacing.sm }} />}
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: insets.bottom + theme.spacing.xl,
          gap: theme.spacing.sm,
        }}
        onEndReached={() => {
          if (list.hasNextPage) void list.fetchNextPage();
        }}
        ListHeaderComponent={
          pending.length > 0 ? (
            <View style={{ gap: theme.spacing.sm, marginBottom: theme.spacing.lg }}>
              <AppText size="title" weight="bold" color="brandText">
                {t('admin.usersPendingSection')} · {pending.length}
              </AppText>
              {pending.map((item) => (
                <UserRow key={item.id} item={item} />
              ))}
              <AppText size="title" weight="bold" color="brandText">
                {t('admin.usersRecentSection')}
              </AppText>
            </View>
          ) : null
        }
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
              {t('admin.usersEmpty')}
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

function UserRow({ item }: { item: AdminUserListItem }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const name = `${item.first_name} ${item.last_name}`.trim() || item.phone_masked;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/admin/users/[id]', params: { id: item.id } })}
      style={({ pressed }) => ({
        padding: theme.spacing.lg,
        gap: theme.spacing.sm,
        borderRadius: theme.radius.card,
        backgroundColor: pressed ? theme.colors.surface2 : theme.colors.surface,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <Avatar initials={initials(item.first_name, item.last_name)} size={48} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText size="bodyLarge" weight="bold" numberOfLines={1}>
            {name}
          </AppText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <AppText
              color={item.status === 'BLOCKED' ? 'red' : 'green'}
              weight="semibold"
              size="secondary"
            >
              {t(
                item.status === 'BLOCKED' ? 'admin.usersStatusBlocked' : 'admin.usersStatusActive',
              )}
            </AppText>
            {item.active_role ? (
              <AppText color="text2" size="secondary">
                · {t(item.active_role === 'EXECUTOR' ? 'role.executorShort' : 'role.customer')}
              </AppText>
            ) : null}
            <AppText color="text2" size="secondary">
              · {item.phone_masked}
            </AppText>
          </View>
        </View>
        <ChevronRight size={22} color={theme.colors.text2} />
      </View>
      {item.tax ? (
        <Tag
          label={`${t(`tax.method.${item.tax.method}`)} · ${t(`admin.verificationStatusValue.${item.tax.status}`)}`}
          tone={item.tax.status === 'PENDING' ? 'orange' : 'neutral'}
        />
      ) : null}
    </Pressable>
  );
}
