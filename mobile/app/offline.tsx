import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { bootstrapSession } from '../src/auth/session-actions';
import { AppText } from '../src/components/AppText';
import { Button } from '../src/components/ui/Button';
import { useTheme } from '../src/theme/ThemeProvider';

/** A saved session exists but the server did not answer at start-up. */
export default function OfflineScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          padding: theme.spacing.xxl,
          gap: theme.spacing.xl,
        }}
      >
        <AppText size="bodyLarge" style={{ textAlign: 'center' }}>
          {t('startup.offline')}
        </AppText>
        <Button title={t('common.retry')} onPress={() => void bootstrapSession()} />
      </View>
    </SafeAreaView>
  );
}
