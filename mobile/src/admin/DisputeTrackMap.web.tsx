import { MapPinned } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { AppText } from '../components/AppText';
import { useTheme } from '../theme/ThemeProvider';
import type { DisputeTrackMapProps } from './DisputeTrackMap';

/** Web preview stand-in: react-native-maps has no web version (same as `TripMap.web.tsx`). */
export function DisputeTrackMap(_props: DisputeTrackMapProps) {
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
        {t('address.webNote')}
      </AppText>
    </View>
  );
}
