import Constants from 'expo-constants';
import { router } from 'expo-router';
import {
  ArrowLeftRight,
  Briefcase,
  CircleQuestionMark,
  ClipboardList,
  Globe,
  LogOut,
  type LucideIcon,
  Moon,
  Settings,
  Users,
  Wallet,
  Wrench,
} from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Modal, Pressable, ScrollView, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { endpoints } from '../api/endpoints';
import { useErrorText } from '../api/use-error-text';
import { signOut } from '../auth/session-actions';
import { initials } from '../lib/input';
import { maskPhone } from '../lib/format';
import { themeToApi, usePreferences } from '../store/preferences';
import { useSession } from '../store/session';
import { useTheme } from '../theme/ThemeProvider';
import { AppText } from './AppText';
import { LanguageList } from './LanguageList';
import { Avatar } from './ui/Avatar';
import { Button } from './ui/Button';

interface MainMenuProps {
  visible: boolean;
  onClose: () => void;
}

/** U1: side menu with profile, role switch, language, night mode and sign-out. */
export function MainMenu({ visible, onClose }: MainMenuProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const errorText = useErrorText();
  const user = useSession((state) => state.user);
  const { language, setLanguage, setThemeMode } = usePreferences();
  const [switching, setSwitching] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);

  if (!user) return null;
  const isExecutor = user.active_role === 'EXECUTOR';
  const name = user.identity
    ? `${user.identity.first_name} ${user.identity.last_name}`
    : user.phone;

  const syncPreferences = (input: {
    lang?: typeof language;
    theme?: 'LIGHT' | 'DARK' | 'AUTO';
  }) => {
    endpoints
      .updatePreferences(input)
      .then((me) => useSession.getState().setUser(me))
      .catch(() => undefined);
  };

  const switchRole = async () => {
    setSwitching(true);
    try {
      useSession.getState().setUser(await endpoints.setRole(isExecutor ? 'CUSTOMER' : 'EXECUTOR'));
      onClose();
    } catch (error) {
      Alert.alert(errorText(error));
    } finally {
      setSwitching(false);
    }
  };

  const soon = () => {
    onClose();
    router.push('/soon');
  };

  const myJobs = () => {
    onClose();
    router.navigate({ pathname: '/home', params: { tab: isExecutor ? 'mine' : 'active' } });
  };

  const confirmLogout = () =>
    Alert.alert(t('menu.logoutConfirm'), undefined, [
      { text: t('common.no'), style: 'cancel' },
      { text: t('menu.logout'), style: 'destructive', onPress: () => void signOut() },
    ]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <View style={{ width: '82%', maxWidth: 380, backgroundColor: theme.colors.bg }}>
          <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + theme.spacing.lg }}>
            <View
              style={{
                backgroundColor: theme.colors.bar,
                paddingTop: insets.top + theme.spacing.xl,
                padding: theme.spacing.xl,
                gap: theme.spacing.sm,
              }}
            >
              <Avatar
                initials={initials(user.identity?.first_name, user.identity?.last_name)}
                size={72}
                ring
              />
              <AppText size="bar" weight="bold" style={{ color: theme.colors.barText }}>
                {name}
              </AppText>
              <AppText style={{ color: theme.colors.barText2 }}>{maskPhone(user.phone)}</AppText>
            </View>

            <View
              style={{
                margin: theme.spacing.lg,
                padding: theme.spacing.lg,
                gap: theme.spacing.md,
                borderRadius: theme.radius.card,
                backgroundColor: theme.colors.brandSoft,
              }}
            >
              <View style={{ flexDirection: 'row', gap: theme.spacing.md, alignItems: 'center' }}>
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: theme.radius.md,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: isExecutor ? theme.colors.orange : theme.colors.brand,
                  }}
                >
                  {isExecutor ? (
                    <Wrench size={24} color={theme.colors.barText} />
                  ) : (
                    <ClipboardList size={24} color={theme.colors.barText} />
                  )}
                </View>
                <View>
                  <AppText size="secondary" color="text2">
                    {t('menu.currentRole')}
                  </AppText>
                  <AppText size="bodyLarge" weight="bold">
                    {t(isExecutor ? 'role.executor' : 'role.customer')}
                  </AppText>
                </View>
              </View>
              <Button
                title={t(isExecutor ? 'menu.switchToCustomer' : 'menu.switchToExecutor')}
                icon={ArrowLeftRight}
                loading={switching}
                onPress={() => void switchRole()}
                style={{ minHeight: theme.size.buttonSecondary + 4 }}
              />
            </View>

            <MenuRow icon={Briefcase} label={t('menu.myJobs')} onPress={myJobs} />
            <MenuRow icon={Wallet} label={t('menu.wallet')} onPress={soon} />
            <MenuRow icon={Users} label={t('menu.referral')} onPress={soon} />
            <MenuRow icon={Settings} label={t('menu.settings')} onPress={soon} />
            <MenuRow
              icon={Globe}
              label={t('menu.language')}
              value={t('language.autonym')}
              onPress={() => setLanguageOpen((open) => !open)}
            />
            {languageOpen ? (
              <View
                style={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.md }}
              >
                <LanguageList
                  value={language}
                  onChange={(code) => {
                    setLanguage(code);
                    setLanguageOpen(false);
                    syncPreferences({ lang: code });
                  }}
                />
              </View>
            ) : null}
            <MenuRow
              icon={Moon}
              label={t('menu.nightMode')}
              right={
                <Switch
                  value={theme.scheme === 'dark'}
                  accessibilityLabel={t('menu.nightMode')}
                  trackColor={{ true: theme.colors.brand, false: theme.colors.border }}
                  thumbColor={theme.colors.bg}
                  onValueChange={(dark) => {
                    const mode = dark ? 'dark' : 'light';
                    setThemeMode(mode);
                    syncPreferences({ theme: themeToApi(mode) });
                  }}
                />
              }
            />
            <MenuRow icon={CircleQuestionMark} label={t('menu.help')} onPress={soon} />
            <View
              style={{
                height: 1,
                backgroundColor: theme.colors.sep,
                marginVertical: theme.spacing.sm,
              }}
            />
            <MenuRow icon={LogOut} label={t('menu.logout')} danger onPress={confirmLogout} />

            <AppText size="caption" color="text2" style={{ padding: theme.spacing.xl }}>
              {t('brand.footer', { version: Constants.expoConfig?.version ?? '' })}
            </AppText>
          </ScrollView>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={onClose}
          style={{ flex: 1, backgroundColor: theme.colors.scrim }}
        />
      </View>
    </Modal>
  );
}

interface MenuRowProps {
  icon: LucideIcon;
  label: string;
  value?: string;
  right?: ReactNode;
  danger?: boolean;
  onPress?: () => void;
}

function MenuRow({ icon: Icon, label, value, right, danger, onPress }: MenuRowProps) {
  const theme = useTheme();
  const color = danger ? theme.colors.red : theme.colors.text;
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.lg,
        minHeight: 56,
        paddingHorizontal: theme.spacing.xl,
        backgroundColor: pressed ? theme.colors.surface2 : 'transparent',
      })}
    >
      <Icon size={24} color={danger ? theme.colors.red : theme.colors.text2} />
      <AppText size="bodyLarge" weight={danger ? 'bold' : 'medium'} style={{ flex: 1, color }}>
        {label}
      </AppText>
      {value ? <AppText color="text2">{value}</AppText> : null}
      {right}
    </Pressable>
  );
}
