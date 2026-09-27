import { createElement } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { endpoints } from '../api/endpoints';
import { queryKeys, useAdminCategories } from '../api/queries';
import type { AdminCategory } from '../api/types';
import { useErrorText } from '../api/use-error-text';
import { AppText } from '../components/AppText';
import { BarHeader, BarIconButton } from '../components/ui/BarHeader';
import { Card } from '../components/ui/Card';
import { categoryIcon } from '../lib/categories';
import { usePreferences } from '../store/preferences';
import { showNotice } from '../lib/notice';
import { OrderPlaceholder } from '../orders/OrderParts';
import { useTheme } from '../theme/ThemeProvider';

/** Categories (`categories.manage`): every category, active or hidden, toggle and edit. */
export function Categories() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const errorText = useErrorText();
  const client = useQueryClient();
  const list = useAdminCategories();

  if (!list.data) {
    return (
      <OrderPlaceholder
        error={list.isError ? errorText(list.error) : null}
        onRetry={() => void list.refetch()}
      />
    );
  }
  const items = [...list.data].sort((a, b) => a.sort_order - b.sort_order);

  const toggle = async (category: AdminCategory) => {
    try {
      const updated = category.active
        ? await endpoints.deactivateCategory(category.id)
        : await endpoints.activateCategory(category.id);
      client.setQueryData(queryKeys.adminCategories, (all: AdminCategory[] | undefined) =>
        (all ?? []).map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (error) {
      showNotice(errorText(error));
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg2 }}>
      <BarHeader
        title={t('admin.categoriesTitle')}
        right={
          <BarIconButton
            icon={Plus}
            label={t('admin.categoryAdd')}
            onPress={() => router.push('/admin/categories/new')}
          />
        }
      />
      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing.lg,
          gap: theme.spacing.sm,
          paddingBottom: insets.bottom + theme.spacing.xl,
        }}
      >
        {items.length === 0 ? (
          <AppText color="text2" style={{ textAlign: 'center', padding: theme.spacing.xxl }}>
            {t('admin.categoriesEmpty')}
          </AppText>
        ) : (
          items.map((category) => (
            <CategoryRow
              key={category.id}
              category={category}
              onToggle={() => void toggle(category)}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

function CategoryRow({ category, onToggle }: { category: AdminCategory; onToggle: () => void }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const language = usePreferences((state) => state.language);
  const name = category.names[language] ?? category.names.uz;

  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          router.push({ pathname: '/admin/categories/[id]', params: { id: category.id } })
        }
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: theme.radius.md,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: `${category.color}22`,
          }}
        >
          {createElement(categoryIcon(category.icon), { size: 20, color: category.color })}
        </View>
        <View style={{ flex: 1 }}>
          <AppText weight="bold" numberOfLines={1}>
            {name}
          </AppText>
          <AppText color="text2" size="secondary">
            {t(category.active ? 'admin.categoryActiveTag' : 'admin.categoryInactiveTag')}
          </AppText>
        </View>
      </Pressable>
      <Switch
        value={category.active}
        onValueChange={onToggle}
        accessibilityLabel={name}
        trackColor={{ true: theme.colors.brand, false: theme.colors.border }}
        thumbColor={theme.colors.bg}
      />
    </Card>
  );
}
