import { useQuery } from '@tanstack/react-query';
import { Check, ClipboardList, Gift, type LucideIcon, Wrench } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { endpoints } from '../../src/api/endpoints';
import type { Role } from '../../src/api/types';
import { useErrorText } from '../../src/api/use-error-text';
import { AppText } from '../../src/components/AppText';
import { Button } from '../../src/components/ui/Button';
import { Screen } from '../../src/components/ui/Screen';
import { StepHeader } from '../../src/components/ui/StepHeader';
import { formatAmount } from '../../src/lib/format';
import { usePreferences } from '../../src/store/preferences';
import { useSession } from '../../src/store/session';
import { useTheme } from '../../src/theme/ThemeProvider';

/** K4: first role choice (step 5/5). Both roles stay available; U1 switches later. */
export default function RoleScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const errorText = useErrorText();
  const language = usePreferences((state) => state.language);
  const [role, setRole] = useState<Role>('CUSTOMER');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const config = useQuery({ queryKey: ['config'], queryFn: endpoints.config });

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      useSession.getState().setUser(await endpoints.setRole(role));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      header={<StepHeader step={5} hideBack />}
      footer={
        <>
          {error ? (
            <AppText color="red" style={{ textAlign: 'center' }}>
              {error}
            </AppText>
          ) : null}
          <Button
            title={t(role === 'EXECUTOR' ? 'role.continueExecutor' : 'role.continueCustomer')}
            loading={busy}
            onPress={() => void submit()}
          />
        </>
      }
    >
      <View style={{ gap: theme.spacing.sm }}>
        <AppText size="titleLarge" weight="bold" accessibilityRole="header">
          {t('role.title')}
        </AppText>
        <AppText size="bodyLarge" color="text2">
          {t('role.subtitle')}
        </AppText>
      </View>

      <View accessibilityRole="radiogroup" style={{ gap: theme.spacing.lg }}>
        <RoleCard
          selected={role === 'CUSTOMER'}
          onPress={() => setRole('CUSTOMER')}
          icon={ClipboardList}
          tileColor={theme.colors.brand}
          title={t('role.customer')}
          tagline={t('role.customerTagline')}
          points={[t('role.customerPoint1'), t('role.customerPoint2')]}
        />
        <RoleCard
          selected={role === 'EXECUTOR'}
          onPress={() => setRole('EXECUTOR')}
          icon={Wrench}
          tileColor={theme.colors.orange}
          title={t('role.executor')}
          tagline={t('role.executorTagline')}
          points={[t('role.executorPoint1')]}
          bonus={
            config.data
              ? t('role.freeBonus', {
                  days: config.data.free_period_days,
                  amount: formatAmount(config.data.demo_bonus, language),
                })
              : undefined
          }
        />
      </View>
    </Screen>
  );
}

interface RoleCardProps {
  selected: boolean;
  onPress: () => void;
  icon: LucideIcon;
  tileColor: string;
  title: string;
  tagline: string;
  points: string[];
  bonus?: string;
}

function RoleCard({
  selected,
  onPress,
  icon: Icon,
  tileColor,
  title,
  tagline,
  points,
  bonus,
}: RoleCardProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        gap: theme.spacing.lg,
        padding: theme.spacing.lg,
        borderRadius: theme.radius.card,
        borderWidth: 2,
        borderColor: selected ? theme.colors.brand : theme.colors.sep,
        backgroundColor: selected ? theme.colors.brandSoft : theme.colors.surface,
      }}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: theme.radius.card,
          backgroundColor: tileColor,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={28} color={theme.colors.barText} />
      </View>
      <View style={{ flex: 1, gap: theme.spacing.sm }}>
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm }}
        >
          <AppText size="title" weight="bold" style={{ flex: 1 }}>
            {title}
          </AppText>
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
        </View>
        <AppText size="bodyLarge" color="text2">
          {tagline}
        </AppText>
        {points.map((point) => (
          <View
            key={point}
            style={{ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'center' }}
          >
            <Check size={18} color={theme.colors.green} strokeWidth={3} />
            <AppText color="text2" style={{ flex: 1 }}>
              {point}
            </AppText>
          </View>
        ))}
        {bonus ? (
          <View
            style={{
              flexDirection: 'row',
              gap: theme.spacing.sm,
              alignItems: 'center',
              padding: theme.spacing.md,
              borderRadius: theme.radius.md,
              backgroundColor: theme.colors.orangeSoft,
            }}
          >
            <Gift size={20} color={theme.colors.orange} />
            <AppText weight="bold" color="orange" style={{ flex: 1 }}>
              {bonus}
            </AppText>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
