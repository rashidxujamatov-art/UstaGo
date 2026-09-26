import { useTranslation } from 'react-i18next';
import { useTheme } from '../../theme/ThemeProvider';
import { AppText } from '../AppText';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';

interface ConfirmSheetProps {
  visible: boolean;
  title: string;
  confirmLabel: string;
  busy?: boolean;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** Yes/no question before an action that cannot be taken back (docs/02 §11). */
export function ConfirmSheet({
  visible,
  title,
  confirmLabel,
  busy = false,
  danger = false,
  onConfirm,
  onClose,
}: ConfirmSheetProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      footer={
        <>
          <Button
            title={confirmLabel}
            loading={busy}
            onPress={onConfirm}
            style={danger ? { backgroundColor: theme.colors.red } : undefined}
          />
          <Button variant="link" title={t('common.cancel')} onPress={onClose} />
        </>
      }
    >
      <AppText size="title" weight="bold" accessibilityRole="header">
        {title}
      </AppText>
    </BottomSheet>
  );
}
