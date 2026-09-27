import { MapPinned } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, View } from 'react-native';
import { AppText } from '../../components/AppText';
import { useTheme } from '../../theme/ThemeProvider';
import type { TripMapProps } from './TripMap';

/**
 * Web preview stand-in: react-native-maps has no web version and the product runs on phones
 * only, same as the BY6 address map (`MapPicker.web.tsx`).
 */
export function TripMap(_props: TripMapProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        {
          alignItems: 'center',
          justifyContent: 'center',
          padding: theme.spacing.xl,
          gap: theme.spacing.sm,
          backgroundColor: theme.colors.wall,
        },
      ]}
    >
      <MapPinned size={32} color={theme.colors.text2} />
      <AppText color="text2" style={{ textAlign: 'center' }}>
        {t(Platform.OS === 'web' ? 'address.webNote' : 'address.mapOffNote')}
      </AppText>
    </View>
  );
}
