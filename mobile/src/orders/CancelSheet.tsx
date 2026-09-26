import { Circle, CircleDot } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';
import type { CancelReason } from '../api/types';
import { AppText } from '../components/AppText';
import { BottomSheet } from '../components/ui/BottomSheet';
import { BoxField } from '../components/ui/BoxField';
import { Button } from '../components/ui/Button';
import { useTheme } from '../theme/ThemeProvider';

const REASONS: CancelReason[] = [
  'NOT_NEEDED',
  'FOUND_OTHER',
  'EXECUTOR_LATE',
  'NO_AGREEMENT',
  'OTHER',
];

interface CancelSheetProps {
  visible: boolean;
  /** A job the pro already took may be cancelled only with a reason (docs/01 §3.3). */
  taken: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: CancelReason, note?: string) => void;
}

/** "Buyurtmani bekor qilish" with the reason list; "Boshqa sabab" needs a note. */
export function CancelSheet({ visible, taken, busy, onClose, onConfirm }: CancelSheetProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [reason, setReason] = useState<CancelReason | null>(null);
  const [note, setNote] = useState('');

  // Before a pro takes the job the reasons about the pro do not apply.
  const reasons = taken
    ? REASONS
    : REASONS.filter((item) => item !== 'EXECUTOR_LATE' && item !== 'NO_AGREEMENT');
  const ready = reason !== null && (reason !== 'OTHER' || note.trim().length > 0);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      footer={
        <Button
          title={t('order.cancelConfirm')}
          disabled={!ready}
          loading={busy}
          onPress={() => reason && onConfirm(reason, reason === 'OTHER' ? note.trim() : undefined)}
          style={{ backgroundColor: theme.colors.red }}
        />
      }
    >
      <AppText size="title" weight="bold" accessibilityRole="header">
        {t('order.cancelTitle')}
      </AppText>
      {reasons.map((item) => {
        const selected = reason === item;
        const Icon = selected ? CircleDot : Circle;
        return (
          <Pressable
            key={item}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => setReason(item)}
            style={{
              minHeight: theme.size.touchTarget,
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.md,
            }}
          >
            <Icon size={24} color={selected ? theme.colors.brand : theme.colors.border} />
            <AppText size="bodyLarge" style={{ flex: 1 }}>
              {t(`order.reasons.${item}`)}
            </AppText>
          </Pressable>
        );
      })}
      {reason === 'OTHER' ? (
        <BoxField
          label={t('order.cancelNote')}
          value={note}
          onChangeText={setNote}
          maxLength={500}
          multiline
          autoFocus
        />
      ) : null}
    </BottomSheet>
  );
}
