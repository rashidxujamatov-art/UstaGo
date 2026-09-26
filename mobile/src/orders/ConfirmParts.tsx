import { Info, Lock, type LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { AppText } from '../components/AppText';
import { Avatar } from '../components/ui/Avatar';
import { useTheme } from '../theme/ThemeProvider';
import type { ColorToken } from '../theme/tokens';

/** Green (or orange) block on top of BY9 / BJ13: "Usta ishni tugatdi", "Mijoz «To‘ladim»ni bosdi". */
export function StatusBanner({
  icon: Icon,
  title,
  subtitle,
  tone = 'green',
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  tone?: 'green' | 'orange';
}) {
  const theme = useTheme();
  const soft = tone === 'green' ? theme.colors.greenSoft : theme.colors.orangeSoft;
  const strong = tone === 'green' ? theme.colors.green : theme.colors.orange;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.lg,
        padding: theme.spacing.lg,
        borderRadius: theme.radius.card,
        backgroundColor: soft,
      }}
    >
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: strong,
        }}
      >
        <Icon size={26} color={theme.colors.bg} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText size="bodyLarge" weight="bold">
          {title}
        </AppText>
        <AppText color="text2">{subtitle}</AppText>
      </View>
    </View>
  );
}

/** Orange note with a lock: what stays blocked until the confirmation (§5.1). */
export function LockNote({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: theme.spacing.md,
        padding: theme.spacing.lg,
        borderRadius: theme.radius.card,
        backgroundColor: theme.colors.orangeSoft,
      }}
    >
      <Lock size={22} color={theme.colors.orange} style={{ marginTop: 1 }} />
      <AppText size="bodyLarge" style={{ flex: 1 }}>
        {children}
      </AppText>
    </View>
  );
}

/** Blue note with an "i" (BJ14 "Xizmat haqi … avtomatik yechiladi"). */
export function InfoNote({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: theme.spacing.md,
        padding: theme.spacing.lg,
        borderRadius: theme.radius.card,
        backgroundColor: theme.colors.brandSoft,
      }}
    >
      <Info size={22} color={theme.colors.brandText} style={{ marginTop: 1 }} />
      <AppText size="bodyLarge" style={{ flex: 1 }}>
        {children}
      </AppText>
    </View>
  );
}

/** Label and amount on one line (settlement card). */
export function MoneyLine({
  label,
  value,
  color = 'text',
  strong = false,
}: {
  label: string;
  value: string;
  color?: ColorToken;
  strong?: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, minHeight: 32 }}
    >
      <AppText
        size="bodyLarge"
        weight={strong ? 'bold' : 'regular'}
        color={strong ? 'text' : 'text2'}
        style={{ flex: 1 }}
      >
        {label}
      </AppText>
      <AppText size={strong ? 'title' : 'bodyLarge'} weight="bold" color={color}>
        {value}
      </AppText>
    </View>
  );
}

/** Red text action under the main button: "Muammo bor", "Pul kelmadi". */
export function DangerLink({
  icon: Icon,
  label,
  onPress,
  disabled = false,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: theme.size.touchTarget,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.sm,
        opacity: pressed || disabled ? 0.6 : 1,
      })}
    >
      <Icon size={22} color={theme.colors.red} />
      <AppText size="bodyLarge" weight="bold" color="red">
        {label}
      </AppText>
    </Pressable>
  );
}

/** The waiting job inside BY10 / BJ14: who, what, how much. */
export function PendingOrderCard({
  initials,
  title,
  subtitle,
  amount,
  method,
}: {
  initials: string;
  title: string;
  subtitle: string;
  amount: string;
  method: string;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        padding: theme.spacing.lg,
        borderRadius: theme.radius.card,
        backgroundColor: theme.colors.surface2,
      }}
    >
      <Avatar initials={initials} size={48} />
      <View style={{ flex: 1 }}>
        <AppText size="bodyLarge" weight="bold">
          {title}
        </AppText>
        <AppText color="text2">{subtitle}</AppText>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <AppText size="bodyLarge" weight="bold">
          {amount}
        </AppText>
        <AppText weight="semibold" color="orange">
          {method}
        </AppText>
      </View>
    </View>
  );
}
