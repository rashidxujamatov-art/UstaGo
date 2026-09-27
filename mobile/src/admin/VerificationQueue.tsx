import { router } from 'expo-router';
import { ChevronRight, FileCheck2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAdminVerifications } from '../api/queries';
import type { TaxVerification } from '../api/types';
import { useErrorText } from '../api/use-error-text';
import { AppText } from '../components/AppText';
import { BarHeader } from '../components/ui/BarHeader';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Tag } from '../components/ui/Chip';
import { initials } from '../lib/input';
import { useOrderTexts } from '../orders/texts';
import { useTheme } from '../theme/ThemeProvider';

/** AD1 "Hujjat murojaatlari": tax verifications waiting for an admin (users.manage). */
export function VerificationQueue() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const errorText = useErrorText();
  const list = useAdminVerifications();
  const items = list.data ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg2 }}>
      <BarHeader title={t('admin.verificationsTitle')} />
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <Row item={item} />}
        ItemSeparatorComponent={() => <View style={{ height: theme.spacing.sm }} />}
        contentContainerStyle={{
          padding: theme.spacing.lg,
          paddingBottom: insets.bottom + theme.spacing.xl,
        }}
        refreshControl={
          <RefreshControl
            refreshing={list.isRefetching}
            onRefresh={() => void list.refetch()}
            tintColor={theme.colors.brand}
          />
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
            <View
              style={{ alignItems: 'center', gap: theme.spacing.md, padding: theme.spacing.xxl }}
            >
              <FileCheck2 size={32} color={theme.colors.text2} />
              <AppText color="text2" style={{ textAlign: 'center' }}>
                {t('admin.verificationsEmpty')}
              </AppText>
            </View>
          )
        }
      />
    </View>
  );
}

function Row({ item }: { item: TaxVerification }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const texts = useOrderTexts();
  const name = `${item.user.first_name} ${item.user.last_name}`.trim() || item.user.phone_masked;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        router.push({ pathname: '/admin/verifications/[id]', params: { id: item.id } })
      }
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        padding: theme.spacing.lg,
        borderRadius: theme.radius.card,
        backgroundColor: pressed ? theme.colors.surface2 : theme.colors.surface,
      })}
    >
      <Avatar initials={initials(item.user.first_name, item.user.last_name)} size={48} />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText size="bodyLarge" weight="bold" numberOfLines={1}>
          {name}
        </AppText>
        <AppText color="text2" numberOfLines={1}>
          {item.user.phone_masked}
        </AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <Tag label={t(`tax.method.${item.method}`)} tone="brand" />
          <AppText size="secondary" color="text2">
            {texts.ago(item.created_at)}
          </AppText>
        </View>
      </View>
      <ChevronRight size={22} color={theme.colors.text2} />
    </Pressable>
  );
}
