import { Redirect, router } from 'expo-router';
import { Info, UserX } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { AppText } from '../../src/components/AppText';
import { Button } from '../../src/components/ui/Button';
import { Screen } from '../../src/components/ui/Screen';
import { StepHeader } from '../../src/components/ui/StepHeader';
import { formatDate } from '../../src/lib/format';
import { useSignup } from '../../src/store/signup';
import { useTheme } from '../../src/theme/ThemeProvider';

/**
 * K3d: MyID found the same person on another account (one PINFL = one account, §2).
 * The new registration was removed by the backend; the user can sign in to the old one.
 */
export default function DuplicateScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const { duplicate, setDuplicate } = useSignup();

  if (!duplicate) return <Redirect href="/" />;

  const leave = (tab: 'login' | 'register') => {
    setDuplicate(null);
    router.replace({ pathname: '/sign', params: { tab } });
  };

  const rows: [string, string, boolean?][] = [
    [t('duplicate.account'), duplicate.phone_masked],
    [t('duplicate.openedAt'), formatDate(new Date(duplicate.created_at))],
    [
      t('duplicate.freePeriod'),
      t(duplicate.free_period_used ? 'duplicate.freeUsed' : 'duplicate.freeUnused'),
      duplicate.free_period_used,
    ],
  ];

  return (
    <Screen
      header={<StepHeader step={4} failed onBack={() => leave('register')} />}
      footer={
        <>
          {/* "Bu men emasman — yordam" appears with the help center (support stage). */}
          <Button title={t('duplicate.signIn')} onPress={() => leave('login')} />
        </>
      }
    >
      <View style={{ alignItems: 'center', gap: theme.spacing.lg }}>
        <View
          style={{
            width: 88,
            height: 88,
            borderRadius: 44,
            backgroundColor: theme.colors.redSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <UserX size={44} color={theme.colors.red} />
        </View>
        <AppText
          size="titleLarge"
          weight="bold"
          style={{ textAlign: 'center' }}
          accessibilityRole="header"
        >
          {t('duplicate.title')}
        </AppText>
        <AppText size="bodyLarge" color="text2" style={{ textAlign: 'center' }}>
          {t('duplicate.subtitle')}
        </AppText>
      </View>

      <View style={{ borderRadius: theme.radius.card, backgroundColor: theme.colors.surface2 }}>
        {rows.map(([label, value, warn], index) => (
          <View
            key={label}
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              padding: theme.spacing.lg,
              borderTopWidth: index === 0 ? 0 : 1,
              borderTopColor: theme.colors.sep,
            }}
          >
            <AppText size="bodyLarge" color="text2">
              {label}
            </AppText>
            <AppText size="bodyLarge" weight="bold" color={warn ? 'orange' : 'text'}>
              {value}
            </AppText>
          </View>
        ))}
      </View>

      <View
        style={{
          flexDirection: 'row',
          gap: theme.spacing.md,
          padding: theme.spacing.lg,
          borderRadius: theme.radius.card,
          borderWidth: 1,
          borderColor: theme.colors.sep,
        }}
      >
        <Info size={24} color={theme.colors.brandText} />
        <AppText color="text2" style={{ flex: 1 }}>
          {t('duplicate.note')}
        </AppText>
      </View>
    </Screen>
  );
}
