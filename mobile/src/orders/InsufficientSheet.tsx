import { router } from 'expo-router';
import { Info, Plus, WalletMinimal } from 'lucide-react-native';
import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { AppText } from '../components/AppText';
import { BottomSheet } from '../components/ui/BottomSheet';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';
import { Separator } from '../components/ui/Card';
import { formatPercent } from '../lib/format';
import { useTheme } from '../theme/ThemeProvider';
import { topUpOptions } from './amounts';
import { useOrderTexts } from './texts';

export interface Shortfall {
  shortfall: string;
  required: string;
  available: string;
  feeBps: number;
  /** The job the top-up is for (BJ6 "#1052 buyurtmani olish uchun yetadi"). */
  orderNumber?: number;
}

interface InsufficientSheetProps {
  value: Shortfall | null;
  onClose: () => void;
}

/** BJ3: the balance does not cover the fee reserve of this job (docs/01 §4). */
export function InsufficientSheet({ value, onClose }: InsufficientSheetProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const texts = useOrderTexts();
  const [picked, setPicked] = useState<bigint | null>(null);
  if (!value) return null;

  const close = () => {
    setPicked(null);
    onClose();
  };
  const options = topUpOptions(BigInt(value.shortfall));
  const amount = picked ?? options[0] ?? 0n;

  const row = (label: string, money: string, strong = false, red = false) => (
    <View
      style={{
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
      }}
    >
      <AppText
        size="bodyLarge"
        weight={strong ? 'bold' : 'regular'}
        color={strong ? 'text' : 'text2'}
        style={{ flex: 1 }}
      >
        {label}
      </AppText>
      <AppText size="bodyLarge" weight="bold" color={red ? 'red' : 'text'}>
        {texts.money(money)}
      </AppText>
    </View>
  );

  return (
    <BottomSheet
      visible
      onClose={close}
      footer={
        <Button
          icon={Plus}
          title={t('insufficient.topUp', { amount: texts.amount(amount) })}
          onPress={() => {
            close();
            router.push({
              pathname: '/wallet/topup',
              params: {
                amount: amount.toString(),
                required: value.required,
                ...(value.orderNumber ? { order: String(value.orderNumber) } : {}),
              },
            });
          }}
        />
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg }}>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.orangeSoft,
          }}
        >
          <WalletMinimal size={28} color={theme.colors.orange} />
        </View>
        <AppText size="titleLarge" weight="bold" accessibilityRole="header" style={{ flex: 1 }}>
          {t('insufficient.title')}
        </AppText>
      </View>
      <AppText size="bodyLarge">
        <Trans
          i18nKey="insufficient.text"
          values={{ shortfall: texts.amount(value.shortfall) }}
          components={{ r: <AppText size="bodyLarge" weight="bold" color="red" /> }}
        />
      </AppText>
      <View
        style={{
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.xs,
          borderRadius: theme.radius.card,
          backgroundColor: theme.colors.surface2,
        }}
      >
        {row(t('insufficient.required'), value.required, true)}
        <Separator />
        {row(t('insufficient.have'), value.available)}
        <Separator />
        {row(t('insufficient.missing'), value.shortfall, false, true)}
      </View>
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
          {t('insufficient.taxNote', { percent: formatPercent(value.feeBps) })}
        </AppText>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        {options.map((option) => (
          <Chip
            key={option.toString()}
            label={texts.amount(option)}
            selected={option === amount}
            onPress={() => setPicked(option)}
          />
        ))}
      </View>
    </BottomSheet>
  );
}
