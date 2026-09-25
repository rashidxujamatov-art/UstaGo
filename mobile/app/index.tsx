import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from '../src/components/AppText';
import { BrandMark } from '../src/components/BrandMark';
import { LANGUAGES } from '../src/i18n/languages';
import { appBranding } from '../src/lib/app-config';
import { formatAmount } from '../src/lib/format';
import { type ThemeMode, usePreferences } from '../src/store/preferences';
import { useTheme } from '../src/theme/ThemeProvider';
import { brandType } from '../src/theme/tokens';

const THEME_MODES: ThemeMode[] = ['light', 'dark', 'auto'];
const { appName, appNameExpansion } = appBranding();

/**
 * Stage 0 foundation check: brand, 4-language switch, light/dark/auto theme and
 * money formatting. Replaced by the real language screen (Main) in stage 1.
 */
export default function FoundationScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const { language, setLanguage, themeMode, setThemeMode } = usePreferences();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: theme.spacing.xxl, gap: theme.spacing.xxl }}>
        <View style={styles.brand}>
          <BrandMark />
          <AppText weight="bold" style={[brandType.name, { marginTop: theme.spacing.lg }]}>
            {appName}
          </AppText>
          <AppText
            weight="semibold"
            color="brandText"
            style={[brandType.expansion, { textTransform: 'uppercase' }]}
          >
            {appNameExpansion}
          </AppText>
          <AppText color="text2">{t('brand.tagline')}</AppText>
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <AppText size="title" weight="bold">
            {t('language.title')}
          </AppText>
          <View
            style={[
              styles.card,
              { borderColor: theme.colors.sep, borderRadius: theme.radius.card },
            ]}
          >
            {LANGUAGES.map((code) => {
              const selected = code === language;
              return (
                <Pressable
                  key={code}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setLanguage(code)}
                  style={[
                    styles.row,
                    {
                      minHeight: theme.size.touchTarget,
                      backgroundColor: selected ? theme.colors.brandSoft : theme.colors.surface,
                      borderBottomColor: theme.colors.sep,
                    },
                  ]}
                >
                  <AppText weight="semibold" size="bodyLarge">
                    {t('language.autonym', { lng: code })}
                  </AppText>
                  <AppText color="text2">{t(`language.names.${code}`)}</AppText>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <AppText color="text2" weight="medium">
            {t('appearance.title')}
          </AppText>
          <View style={[styles.segment, { backgroundColor: theme.colors.surface2 }]}>
            {THEME_MODES.map((mode) => {
              const selected = mode === themeMode;
              return (
                <Pressable
                  key={mode}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setThemeMode(mode)}
                  style={[
                    styles.segmentItem,
                    {
                      minHeight: theme.size.touchTarget,
                      borderRadius: theme.radius.md,
                      backgroundColor: selected ? theme.colors.surface : 'transparent',
                    },
                  ]}
                >
                  <AppText weight={selected ? 'semibold' : 'regular'}>
                    {t(`appearance.${mode}`)}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>

        <AppText color="text2">
          {t('common.money', { amount: formatAmount(18_000_000n, language) })}
          {'  ·  '}
          {t('common.money', { amount: formatAmount(-450_000n, language) })}
        </AppText>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: 'center', gap: 4 },
  card: { borderWidth: 1, overflow: 'hidden' },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  segment: { flexDirection: 'row', padding: 4, borderRadius: 14 },
  segmentItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
