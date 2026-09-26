import { router } from 'expo-router';
import { Menu, Wallet } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWallet } from '../api/queries';
import { appBranding } from '../lib/app-config';
import { formatAmount } from '../lib/format';
import { usePreferences } from '../store/preferences';
import { useTheme } from '../theme/ThemeProvider';
import { brandType } from '../theme/tokens';
import { AppText } from './AppText';

const { appName } = appBranding();

export interface HeaderTab<T extends string> {
  value: T;
  label: string;
  count?: number;
}

interface HomeHeaderProps<T extends string> {
  roleLabel: string;
  onMenu: () => void;
  tabs: HeaderTab<T>[];
  tab: T;
  onTab: (tab: T) => void;
}

/** BY1 / BJ1 header: menu, name, role, balance and the list tabs. */
export function HomeHeader<T extends string>({
  roleLabel,
  onMenu,
  tabs,
  tab,
  onTab,
}: HomeHeaderProps<T>) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const language = usePreferences((state) => state.language);
  const wallet = useWallet();

  return (
    <View style={{ backgroundColor: theme.colors.bar, paddingTop: insets.top }}>
      <View
        style={{
          height: theme.size.headerBar,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
          paddingHorizontal: theme.spacing.sm,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('menu.open')}
          onPress={onMenu}
          style={{
            width: theme.size.touchTarget,
            height: theme.size.touchTarget,
            alignItems: 'center',
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
            flexShrink: 1,
          }}
        >
          <AppText weight="semibold" numberOfLines={1} style={{ color: theme.colors.pillText }}>
            {roleLabel}
          </AppText>
        </View>
        {wallet.data ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('menu.wallet')}
            onPress={() => router.push('/wallet')}
            style={{
              minHeight: 40,
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.sm,
              paddingHorizontal: theme.spacing.md,
              marginLeft: 'auto',
              marginRight: theme.spacing.xs,
              borderRadius: 999,
              overflow: 'hidden',
            }}
          >
            {/* Darkened bar color; the design has no separate token for it. */}
            <View
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: 0,
                right: 0,
                backgroundColor: theme.colors.scrim,
                opacity: 0.45,
              }}
            />
            <Wallet size={20} color={theme.colors.barText} />
            <AppText size="bodyLarge" weight="bold" style={{ color: theme.colors.barText }}>
              {formatAmount(wallet.data.available, language)}
            </AppText>
          </Pressable>
        ) : null}
      </View>

      <View
        accessibilityRole="tablist"
        style={{ flexDirection: 'row', paddingHorizontal: theme.spacing.sm }}
      >
        {tabs.map((item) => {
          const selected = item.value === tab;
          return (
            <Pressable
              key={item.value}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={item.count ? `${item.label} ${item.count}` : item.label}
              onPress={() => onTab(item.value)}
              style={{
                minHeight: 52,
                paddingHorizontal: theme.spacing.md,
                justifyContent: 'center',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                <AppText
                  size="bodyLarge"
                  weight={selected ? 'bold' : 'medium'}
                  style={{ color: selected ? theme.colors.barText : theme.colors.barText2 }}
                >
                  {item.label}
                </AppText>
                {item.count ? (
                  <View
                    style={{
                      minWidth: 24,
                      height: 24,
                      paddingHorizontal: 6,
                      borderRadius: 12,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: theme.colors.pillBg,
                    }}
                  >
                    <AppText
                      size="secondary"
                      weight="bold"
                      style={{ color: theme.colors.pillText }}
                    >
                      {item.count}
                    </AppText>
                  </View>
                ) : null}
              </View>
              <View
                style={{
                  position: 'absolute',
                  left: theme.spacing.xs,
                  right: theme.spacing.xs,
                  bottom: 0,
                  height: 4,
                  borderTopLeftRadius: 3,
                  borderTopRightRadius: 3,
                  backgroundColor: selected ? theme.colors.barText : 'transparent',
                }}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
