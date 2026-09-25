import { Menu } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../../src/components/AppText';
import { MainMenu } from '../../src/components/MainMenu';
import { appBranding } from '../../src/lib/app-config';
import { formatDate } from '../../src/lib/format';
import { useSession } from '../../src/store/session';
import { useTheme } from '../../src/theme/ThemeProvider';
import { brandType } from '../../src/theme/tokens';

const { appName } = appBranding();

/**
 * Home after onboarding. Stage 1 shows the header bar and U1; the customer home (BY1)
 * and the job feed (BJ1) arrive in stage 2.
 */
export default function HomeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const user = useSession((state) => state.user);
  const [menuOpen, setMenuOpen] = useState(false);
  if (!user) return null;

  const isExecutor = user.active_role === 'EXECUTOR';

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg2 }}>
      <View
        style={{
          backgroundColor: theme.colors.bar,
          paddingTop: insets.top,
          paddingHorizontal: theme.spacing.lg,
        }}
      >
        <View
          style={{
            height: theme.size.headerBar,
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.md,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('menu.open')}
            onPress={() => setMenuOpen(true)}
            style={{
              width: theme.size.touchTarget,
              height: theme.size.touchTarget,
              justifyContent: 'center',
            }}
          >
            <Menu size={28} color={theme.colors.barText} />
          </Pressable>
          <AppText weight="bold" style={[brandType.bar, { color: theme.colors.barText }]}>
            {appName}
          </AppText>
          <View
            style={{
              paddingHorizontal: theme.spacing.md,
              paddingVertical: 4,
              borderRadius: 999,
              backgroundColor: theme.colors.pillBg,
            }}
          >
            <AppText weight="semibold" style={{ color: theme.colors.pillText }}>
              {t(isExecutor ? 'role.executor' : 'role.customer')}
            </AppText>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}>
        <View
          style={{
            padding: theme.spacing.xl,
            gap: theme.spacing.sm,
            borderRadius: theme.radius.card,
            backgroundColor: theme.colors.surface,
          }}
        >
          <AppText size="title" weight="bold">
            {t('home.greeting', { name: user.identity?.first_name ?? '' })}
          </AppText>
          {isExecutor && user.executor ? (
            <AppText color="orange" weight="semibold">
              {t('home.freePeriodUntil', {
                date: formatDate(new Date(user.executor.free_period_end)),
              })}
            </AppText>
          ) : null}
          <AppText color="text2">{t('common.comingSoon')}</AppText>
        </View>
      </ScrollView>

      <MainMenu visible={menuOpen} onClose={() => setMenuOpen(false)} />
    </View>
  );
}
