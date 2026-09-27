import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { endpoints } from '../api/endpoints';
import { queryKeys, useConfig, useTaxStatus } from '../api/queries';
import { useErrorText } from '../api/use-error-text';
import { BarHeader } from '../components/ui/BarHeader';
import { showNotice } from '../lib/notice';
import { OrderPlaceholder } from '../orders/OrderParts';
import { useTheme } from '../theme/ThemeProvider';
import { MethodPicker } from './MethodPicker';
import { StatusCard } from './StatusCard';

/**
 * BJ8 (choose a method) and BJ9 (status) in one screen: "Soliq holati" from the executor
 * menu, and where the app sends an executor whose accept failed with TAX_METHOD_REQUIRED.
 */
export function TaxScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const errorText = useErrorText();
  const client = useQueryClient();
  const status = useTaxStatus();
  const config = useConfig();
  const [manualChoose, setManualChoose] = useState(false);
  const [remindersBusy, setRemindersBusy] = useState(false);

  const data = status.data;
  const cfg = config.data;

  // Rates come from the settings (CLAUDE.md rule 7): wait for the config, never guess them.
  if (!data || !cfg) {
    const failed = status.isError ? status.error : config.isError ? config.error : null;
    return (
      <OrderPlaceholder
        error={failed ? errorText(failed) : null}
        onRetry={() => {
          void status.refetch();
          void config.refetch();
        }}
      />
    );
  }

  const toggleReminders = async (enabled: boolean) => {
    setRemindersBusy(true);
    try {
      client.setQueryData(queryKeys.taxStatus, await endpoints.taxSetReminders(enabled));
    } catch (error) {
      showNotice(errorText(error));
    } finally {
      setRemindersBusy(false);
    }
  };

  // MethodPicker clears `manualChoose` itself the moment a choice is made (self-employed
  // verified/pending, or before leaving for BJ10 / the certificate upload), so no effect is
  // needed here to close it again once the status updates.
  const showPicker = manualChoose || data.method === null;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg2 }}>
      <BarHeader title={t('tax.title')} />
      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing.lg,
          gap: theme.spacing.lg,
          paddingBottom: insets.bottom + theme.spacing.xl,
        }}
      >
        {showPicker ? (
          <MethodPicker
            methods={data.methods_enabled}
            feeBps={cfg.fee_bps}
            preselect={data.method ?? data.rejected?.method ?? null}
            rejected={data.status === 'REJECTED' ? data.rejected : null}
            expired={data.status === 'EXPIRED'}
            onChosen={() => setManualChoose(false)}
          />
        ) : (
          <StatusCard
            status={data}
            feeBps={cfg.fee_bps}
            reminderDays={cfg.self_employed_reminder_days}
            remindersBusy={remindersBusy}
            onToggleReminders={(enabled) => void toggleReminders(enabled)}
            onChangeMethod={() => setManualChoose(true)}
          />
        )}
      </ScrollView>
    </View>
  );
}
