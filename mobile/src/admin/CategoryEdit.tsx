import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { endpoints } from '../api/endpoints';
import { queryKeys, useAdminCategories } from '../api/queries';
import type { AdminCategory, Language } from '../api/types';
import { useErrorText } from '../api/use-error-text';
import { AppText } from '../components/AppText';
import { BarHeader } from '../components/ui/BarHeader';
import { BoxField } from '../components/ui/BoxField';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { CATEGORY_ICONS, categoryIcon } from '../lib/categories';
import { leave } from '../lib/navigation';
import { showNotice } from '../lib/notice';
import { OrderPlaceholder } from '../orders/OrderParts';
import { useTheme } from '../theme/ThemeProvider';

const LANGS: Language[] = ['uz', 'ru', 'en', 'tg'];
const SLUG_RE = /^[a-z][a-z0-9-]{1,40}$/;
const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

/** Categories create/edit form (`categories.manage`): slug fixed after creation, 4-language names. */
export function CategoryEdit({ id }: { id?: string }) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const client = useQueryClient();
  const list = useAdminCategories();
  const existing = id ? list.data?.find((category) => category.id === id) : undefined;

  if (id && !list.data) {
    return (
      <OrderPlaceholder
        error={list.isError ? errorText(list.error) : null}
        onRetry={() => void list.refetch()}
      />
    );
  }
  if (id && !existing) {
    return <OrderPlaceholder error={t('adminErrors.categoryNotFound')} />;
  }

  return <CategoryForm id={id} existing={existing} client={client} />;
}

function CategoryForm({
  id,
  existing,
  client,
}: {
  id?: string;
  existing?: AdminCategory;
  client: ReturnType<typeof useQueryClient>;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const errorText = useErrorText();
  const [slug, setSlug] = useState(existing?.slug ?? '');
  const [names, setNames] = useState<Record<Language, string>>(
    existing?.names ?? { uz: '', ru: '', en: '', tg: '' },
  );
  const [icon, setIcon] = useState(existing?.icon ?? Object.keys(CATEGORY_ICONS)[0]!);
  const [color, setColor] = useState(existing?.color ?? '#2461C2');
  const [sortOrder, setSortOrder] = useState(String(existing?.sort_order ?? 0));
  const [saving, setSaving] = useState(false);

  const sort = Number.parseInt(sortOrder, 10);
  const valid =
    (id || SLUG_RE.test(slug)) &&
    LANGS.every((lang) => names[lang].trim().length > 0) &&
    COLOR_RE.test(color) &&
    Number.isFinite(sort);

  const save = async () => {
    setSaving(true);
    try {
      if (id) {
        const updated = await endpoints.updateCategory(id, {
          names,
          icon,
          color,
          sort_order: sort,
        });
        client.setQueryData(queryKeys.adminCategories, (all: AdminCategory[] | undefined) =>
          (all ?? []).map((item) => (item.id === updated.id ? updated : item)),
        );
      } else {
        const created = await endpoints.createCategory({
          slug,
          names,
          icon,
          color,
          sort_order: sort,
        });
        client.setQueryData(queryKeys.adminCategories, (all: AdminCategory[] | undefined) => [
          ...(all ?? []),
          created,
        ]);
      }
      leave('/admin/categories');
    } catch (error) {
      showNotice(errorText(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg2 }}>
      <BarHeader title={t(id ? 'admin.categoryEditTitle' : 'admin.categoryNewTitle')} />
      <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}>
        <Card>
          <BoxField
            label={t('admin.categorySlugLabel')}
            value={slug}
            onChangeText={(text) => setSlug(text.toLowerCase())}
            editable={!id}
            maxLength={42}
            autoCapitalize="none"
          />
          <AppText color="text2" size="secondary">
            {t('admin.categorySlugHint')}
          </AppText>
        </Card>

        <Card>
          {LANGS.map((lang) => (
            <BoxField
              key={lang}
              label={t('admin.categoryNameLabel', { lang: lang.toUpperCase() })}
              value={names[lang]}
              onChangeText={(text) => setNames((prev) => ({ ...prev, [lang]: text }))}
              maxLength={60}
            />
          ))}
        </Card>

        <Card title={t('admin.categoryIconLabel')}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {Object.keys(CATEGORY_ICONS).map((key) => {
              const Icon = categoryIcon(key);
              const selected = icon === key;
              return (
                <Pressable
                  key={key}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setIcon(key)}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: theme.radius.md,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 2,
                    borderColor: selected ? theme.colors.brand : theme.colors.sep,
                    backgroundColor: selected ? theme.colors.brandSoft : theme.colors.bg,
                  }}
                >
                  <Icon size={20} color={selected ? theme.colors.brand : theme.colors.text2} />
                </Pressable>
              );
            })}
          </View>
        </Card>

        <Card>
          <View style={{ flexDirection: 'row', gap: theme.spacing.md, alignItems: 'flex-end' }}>
            <BoxField
              label={t('admin.categoryColorLabel')}
              value={color}
              onChangeText={setColor}
              maxLength={7}
              autoCapitalize="characters"
              grow
              error={
                color.length > 0 && !COLOR_RE.test(color) ? t('sa.settingsFieldInvalid') : null
              }
            />
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: theme.radius.md,
                backgroundColor: COLOR_RE.test(color) ? color : theme.colors.surface2,
                borderWidth: 1,
                borderColor: theme.colors.sep,
              }}
            />
          </View>
          <BoxField
            label={t('admin.categorySortLabel')}
            value={sortOrder}
            onChangeText={(text) => setSortOrder(text.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            maxLength={4}
          />
        </Card>

        <Button
          title={t('admin.categorySave')}
          loading={saving}
          disabled={!valid}
          onPress={() => void save()}
        />
      </ScrollView>
    </View>
  );
}
