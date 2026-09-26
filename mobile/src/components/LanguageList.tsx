import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { type Language, LANGUAGES } from '../i18n/languages';
import { useTheme } from '../theme/ThemeProvider';
import { AppText } from './AppText';

/** Badge letters on the language screen (Main): Tajik shows "TJ", as in the design. */
const BADGE: Record<Language, string> = { uz: 'UZ', ru: 'RU', en: 'EN', tg: 'TJ' };

interface LanguageListProps {
  value: Language;
  onChange: (language: Language) => void;
}

/** The four languages with native name and a subtitle in the current UI language. */
export function LanguageList({ value, onChange }: LanguageListProps) {
  const theme = useTheme();
  const { t } = useTranslation();

  return (
    <View
      accessibilityRole="radiogroup"
      style={{
        borderWidth: 1,
        borderColor: theme.colors.sep,
        borderRadius: theme.radius.card,
        overflow: 'hidden',
      }}
    >
      {LANGUAGES.map((code, index) => {
        const selected = code === value;
        return (
          <Pressable
            key={code}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(code)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.lg,
              paddingHorizontal: theme.spacing.lg,
              paddingVertical: theme.spacing.md,
              minHeight: 64,
              backgroundColor: selected ? theme.colors.brandSoft : theme.colors.surface,
              borderTopWidth: index === 0 ? 0 : 1,
              borderTopColor: theme.colors.sep,
            }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: selected ? theme.colors.brand : theme.colors.surface2,
              }}
            >
              <AppText
                weight="bold"
                size="secondary"
                style={{ color: selected ? theme.colors.barText : theme.colors.text }}
              >
                {BADGE[code]}
              </AppText>
            </View>
            <View style={{ flex: 1 }}>
              <AppText weight="semibold" size="bodyLarge">
                {t('language.autonym', { lng: code })}
              </AppText>
              <AppText color="text2">{t(`language.names.${code}`)}</AppText>
            </View>
            <View
              style={{
                width: 26,
                height: 26,
                borderRadius: 13,
                borderWidth: selected ? 8 : 2,
                borderColor: selected ? theme.colors.brand : theme.colors.border,
                backgroundColor: theme.colors.bg,
              }}
            />
          </Pressable>
        );
      })}
    </View>
  );
}
