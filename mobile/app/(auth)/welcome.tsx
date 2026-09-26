import { router } from 'expo-router';
import { ArrowRight, Moon, Sun, SunMoon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { AppText } from '../../src/components/AppText';
import { BrandMark } from '../../src/components/BrandMark';
import { LanguageList } from '../../src/components/LanguageList';
import { Button } from '../../src/components/ui/Button';
import { Screen } from '../../src/components/ui/Screen';
import { Segmented } from '../../src/components/ui/Segmented';
import { LANGUAGES } from '../../src/i18n/languages';
import { appBranding } from '../../src/lib/app-config';
import { type ThemeMode, usePreferences } from '../../src/store/preferences';
import { useTheme } from '../../src/theme/ThemeProvider';
import { brandType } from '../../src/theme/tokens';

const { appName, appNameExpansion } = appBranding();

/** Main: language and appearance (docs/01 §2, step 1). */
export default function WelcomeScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const { language, setLanguage, themeMode, setThemeMode, setWelcomed } = usePreferences();

  const hint = LANGUAGES.filter((code) => code !== language)
    .map((code) => t('language.title', { lng: code }))
    .join(' · ');

  const go = (tab: 'register' | 'login') => {
    setWelcomed();
    router.push({ pathname: '/sign', params: { tab } });
  };

  return (
    <Screen
      footer={
        <>
          <Button
            title={t('common.continue')}
            iconRight={ArrowRight}
            onPress={() => go('register')}
          />
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
            <AppText color="text2" size="bodyLarge">
              {t('auth.haveAccount')}
            </AppText>
            <Button variant="link" title={t('auth.signIn')} onPress={() => go('login')} />
          </View>
        </>
      }
    >
      <View style={{ alignItems: 'center', gap: 4, marginTop: theme.spacing.xxl }}>
        <BrandMark />
        <AppText weight="bold" style={[brandType.name, { marginTop: theme.spacing.lg }]}>
          {appName}
        </AppText>
        <AppText
          weight="bold"
          color="brandText"
          style={[brandType.expansion, { textTransform: 'uppercase' }]}
        >
          {appNameExpansion}
        </AppText>
        <AppText color="text2" size="bodyLarge" style={{ textAlign: 'center' }}>
          {t('brand.tagline')}
        </AppText>
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <AppText size="titleLarge" weight="bold" accessibilityRole="header">
          {t('language.title')}
        </AppText>
        <AppText color="text2">{hint}</AppText>
      </View>
      <LanguageList value={language} onChange={setLanguage} />

      <View style={{ gap: theme.spacing.sm }}>
        <AppText weight="semibold" color="text2">
          {t('appearance.title')}
        </AppText>
        <Segmented<ThemeMode>
          value={themeMode}
          onChange={setThemeMode}
          options={[
            { value: 'light', label: t('appearance.light'), icon: Sun },
            { value: 'dark', label: t('appearance.dark'), icon: Moon },
            { value: 'auto', label: t('appearance.auto'), icon: SunMoon },
          ]}
        />
      </View>
    </Screen>
  );
}
