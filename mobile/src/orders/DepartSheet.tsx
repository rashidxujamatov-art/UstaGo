import { Check, LocateFixed, Navigation } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { AppText } from '../components/AppText';
import { BottomSheet } from '../components/ui/BottomSheet';
import { Button } from '../components/ui/Button';
import { useTheme } from '../theme/ThemeProvider';

interface DepartSheetProps {
  visible: boolean;
  /** The customer's name, e.g. "Aziza Y.". */
  customerName: string;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

const BULLETS = ['bullet1', 'bullet2', 'bullet3'] as const;

/** BJ11: shown the first time the pro taps "Yo'lga chiqdim" (docs/01 §10). */
export function DepartSheet({ visible, customerName, busy, onConfirm, onClose }: DepartSheetProps) {
  const theme = useTheme();
  const { t } = useTranslation();

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      footer={
        <>
          <Button
            title={t('trip.intro.confirm')}
            icon={Navigation}
            loading={busy}
            onPress={onConfirm}
          />
          <Button variant="link" title={t('trip.intro.later')} onPress={onClose} />
        </>
      }
    >
      <View style={{ alignItems: 'center', gap: theme.spacing.md }}>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.brandSoft,
          }}
        >
          <LocateFixed size={30} color={theme.colors.brand} />
        </View>
        <AppText
          size="title"
          weight="bold"
          style={{ textAlign: 'center' }}
          accessibilityRole="header"
        >
          {t('trip.intro.title')}
        </AppText>
        <AppText color="text2" style={{ textAlign: 'center' }}>
          {t('trip.intro.body', { name: customerName })}
        </AppText>
      </View>
      <View
        style={{
          gap: theme.spacing.sm,
          padding: theme.spacing.lg,
          borderRadius: theme.radius.card,
          backgroundColor: theme.colors.surface2,
        }}
      >
        {BULLETS.map((key) => (
          <View
            key={key}
            style={{ flexDirection: 'row', gap: theme.spacing.md, alignItems: 'center' }}
          >
            <Check size={18} color={theme.colors.green} />
            <AppText style={{ flex: 1 }}>{t(`trip.intro.${key}`)}</AppText>
          </View>
        ))}
      </View>
      <AppText size="secondary" color="text2" style={{ textAlign: 'center' }}>
        {t('trip.intro.permissionHint')}
      </AppText>
    </BottomSheet>
  );
}
