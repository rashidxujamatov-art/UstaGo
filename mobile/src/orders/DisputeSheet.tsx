import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppText } from '../components/AppText';
import { BottomSheet } from '../components/ui/BottomSheet';
import { Button } from '../components/ui/Button';
import { TextField } from '../components/ui/TextField';
import { useTheme } from '../theme/ThemeProvider';

interface DisputeSheetProps {
  visible: boolean;
  /** "Pul kelmadi" for the executor, "Muammo bor" for the customer. */
  executor: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: (note?: string) => void;
}

/** Confirms opening a dispute (§5.1); the note helps the admin (stage 7). */
export function DisputeSheet({ visible, executor, busy, onClose, onConfirm }: DisputeSheetProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [note, setNote] = useState('');

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      footer={
        <>
          <Button
            title={t('confirm.disputeConfirm')}
            loading={busy}
            onPress={() => onConfirm(note.trim() || undefined)}
            style={{ backgroundColor: theme.colors.red }}
          />
          <Button variant="link" title={t('common.cancel')} onPress={onClose} />
        </>
      }
    >
      <AppText size="title" weight="bold" accessibilityRole="header">
        {t(executor ? 'confirm.notReceivedTitle' : 'confirm.disputeTitle')}
      </AppText>
      <AppText size="bodyLarge" color="text2">
        {t('confirm.disputeText')}
      </AppText>
      <TextField
        label={t('confirm.disputeNote')}
        value={note}
        onChangeText={setNote}
        maxLength={1000}
        multiline
      />
    </BottomSheet>
  );
}
