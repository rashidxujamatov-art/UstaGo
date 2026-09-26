import { Check, type LucideIcon, ShieldCheck } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';
import type { PaymentInfo } from '../api/types';
import { AppText } from '../components/AppText';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { formatAmount } from '../lib/format';
import { priceDigits } from '../lib/input';
import { usePreferences } from '../store/preferences';
import { useTheme } from '../theme/ThemeProvider';
import type { ColorToken } from '../theme/tokens';

/** One payment method with a radio (BY5, BJ6). */
export function MethodRow({
  icon: Icon,
  color,
  title,
  subtitle,
  selected,
  onPress,
  last = false,
}: {
  icon: LucideIcon;
  color: ColorToken;
  title: string;
  subtitle?: ReactNode;
  selected: boolean;
  onPress: () => void;
  last?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.md,
        backgroundColor: selected ? theme.colors.brandSoft : theme.colors.surface,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: theme.colors.sep,
      }}
    >
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: theme.radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors[color],
        }}
      >
        <Icon size={24} color={theme.colors.barText} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText size="bodyLarge" weight="bold">
          {title}
        </AppText>
        {subtitle ? <AppText color="text2">{subtitle}</AppText> : null}
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
}

/** Card holding a list of MethodRows, clipped to the card radius. */
export function MethodList({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={{
        borderRadius: theme.radius.card,
        overflow: 'hidden',
        backgroundColor: theme.colors.surface,
      }}
    >
      {children}
    </View>
  );
}

/** Green shield line: "To‘lov rasmiy to‘lov tizimi orqali…". */
export function SecureNote({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: theme.spacing.md, padding: theme.spacing.sm }}>
      <ShieldCheck size={22} color={theme.colors.green} style={{ marginTop: 1 }} />
      <AppText size="bodyLarge" color="text2" style={{ flex: 1 }}>
        {children}
      </AppText>
    </View>
  );
}

/** Big so‘m amount field (BJ6, BJ7); holds whole so‘m digits. */
export function AmountInput({
  label,
  digits,
  onChange,
  error = false,
}: {
  label: string;
  digits: string;
  onChange: (digits: string) => void;
  error?: boolean;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const language = usePreferences((state) => state.language);
  const shown = digits ? formatAmount(`${digits}00`, language) : '';
  return (
    <View style={{ gap: theme.spacing.xs }}>
      <AppText weight="semibold" color="text2">
        {label}
      </AppText>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingBottom: theme.spacing.xs,
          borderBottomWidth: 3,
          borderBottomColor: error ? theme.colors.red : theme.colors.brand,
        }}
      >
        <TextInput
          accessibilityLabel={label}
          value={shown}
          onChangeText={(text) => onChange(priceDigits(text))}
          keyboardType="number-pad"
          placeholder="0"
          placeholderTextColor={theme.colors.text2}
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: theme.fontFamily.bold,
            fontSize: theme.fontSize.amountLarge,
            color: theme.colors.text,
            paddingVertical: theme.spacing.xs,
          }}
        />
        <AppText size="title" weight="semibold" color="text2">
          {t('common.currency')}
        </AppText>
      </View>
    </View>
  );
}

/** A Click / Payme payment waiting for the provider (BY5, BJ6). */
export function PaymentWaiting({
  payment,
  providerName,
  hint,
  testing,
  onReopen,
  onTestComplete,
}: {
  payment: PaymentInfo;
  providerName: string;
  /** What happens once the provider confirms; the order text by default. */
  hint?: string;
  testing: boolean;
  onReopen: () => void;
  onTestComplete: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const failed = payment.status === 'CANCELLED' || payment.status === 'EXPIRED';
  if (payment.status === 'PAID') {
    return (
      <Card style={{ alignItems: 'center' }}>
        <Check size={36} color={theme.colors.green} />
        <AppText size="title" weight="bold" color="green">
          {t('pay.paid')}
        </AppText>
      </Card>
    );
  }
  return (
    <Card style={{ alignItems: 'center' }}>
      {failed ? null : <ActivityIndicator color={theme.colors.brand} />}
      <AppText size="title" weight="bold" style={{ textAlign: 'center' }}>
        {failed ? t('pay.failed') : t('pay.waiting')}
      </AppText>
      {failed ? null : (
        <AppText color="text2" style={{ textAlign: 'center' }}>
          {hint ?? t('pay.waitingHint', { provider: providerName })}
        </AppText>
      )}
      {payment.checkout_url && !failed ? (
        <Button
          variant="secondary"
          title={t('pay.openAgain', { provider: providerName })}
          onPress={onReopen}
        />
      ) : null}
      {payment.test_mode && !failed ? (
        <Button
          variant="link"
          title={t('pay.testComplete')}
          loading={testing}
          onPress={onTestComplete}
        />
      ) : null}
    </Card>
  );
}
