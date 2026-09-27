import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Send } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Switch, View } from 'react-native';
import { endpoints } from '../api/endpoints';
import { queryKeys, useConfig, useTaxMethodsOverview } from '../api/queries';
import type { TaxMethod } from '../api/types';
import { useErrorText } from '../api/use-error-text';
import { AppText } from '../components/AppText';
import { BarHeader } from '../components/ui/BarHeader';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { formatPercent } from '../lib/format';
import { showNotice } from '../lib/notice';
import { OrderPlaceholder } from '../orders/OrderParts';
import { useTheme } from '../theme/ThemeProvider';

const METHOD_ORDER: TaxMethod[] = ['SELF_EMPLOYED', 'XOLIS'];

/** SA5 "Soliq usullari": super admin toggles the methods and reminds pros without one. */
export function TaxMethods() {
  const theme = useTheme();
  const { t } = useTranslation();
  const errorText = useErrorText();
  const client = useQueryClient();
  const overview = useTaxMethodsOverview();
  const config = useConfig();
  const [toggling, setToggling] = useState<TaxMethod | null>(null);
  const [reminding, setReminding] = useState(false);

  // The fee rate comes from the settings (CLAUDE.md rule 7): wait for the config too.
  if (!overview.data || !config.data) {
    const failed = overview.isError ? overview.error : config.isError ? config.error : null;
    return (
      <OrderPlaceholder
        error={failed ? errorText(failed) : null}
        onRetry={() => {
          void overview.refetch();
          void config.refetch();
        }}
      />
    );
  }
  const data = overview.data;
  const percent = formatPercent(config.data.fee_bps);

  const toggle = async (method: TaxMethod, enabled: boolean) => {
    setToggling(method);
    const next = enabled
      ? [...data.enabled, method]
      : data.enabled.filter((item) => item !== method);
    try {
      client.setQueryData(queryKeys.taxMethodsOverview, await endpoints.setTaxMethodsEnabled(next));
    } catch (error) {
      showNotice(errorText(error));
    } finally {
      setToggling(null);
    }
  };

  const remind = async () => {
    setReminding(true);
    try {
      const { sent } = await endpoints.remindTaxMethods();
      showNotice(t('sa.remindSent', { count: sent }));
    } catch (error) {
      showNotice(errorText(error));
    } finally {
      setReminding(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg2 }}>
      <BarHeader title={t('sa.taxMethodsTitle')} />
      <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}>
        <AppText color="text2">{t('sa.taxMethodsIntro')}</AppText>

        {METHOD_ORDER.map((method, index) => {
          const enabled = data.enabled.includes(method);
          return (
            <Card key={method}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.colors.surface2,
                  }}
                >
                  <AppText weight="bold">{index + 1}</AppText>
                </View>
                <AppText size="bodyLarge" weight="bold" style={{ flex: 1 }}>
                  {t(`tax.method.${method}`)}
                </AppText>
                <Switch
                  value={enabled}
                  disabled={toggling !== null}
                  accessibilityLabel={t(`tax.method.${method}`)}
                  trackColor={{ true: theme.colors.brand, false: theme.colors.border }}
                  thumbColor={theme.colors.bg}
                  onValueChange={(value) => void toggle(method, value)}
                />
              </View>
              <AppText color="text2">{t(`tax.methodDesc.${method}`)}</AppText>
              <AppText color="text2">{t('sa.acceptShare', { percent })}</AppText>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  paddingTop: theme.spacing.sm,
                  borderTopWidth: 1,
                  borderTopColor: theme.colors.sep,
                }}
              >
                <AppText color="text2">{t('sa.chosenBy')}</AppText>
                <AppText weight="bold">{data.counts[method]}</AppText>
              </View>
            </Card>
          );
        })}

        {data.without_method > 0 ? (
          <View
            style={{
              padding: theme.spacing.lg,
              gap: theme.spacing.md,
              borderRadius: theme.radius.card,
              backgroundColor: theme.colors.orangeSoft,
            }}
          >
            <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
              <AlertTriangle size={22} color={theme.colors.orange} style={{ marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <AppText weight="bold" color="orange">
                  {t('sa.withoutMethod', { count: data.without_method })}
                </AppText>
                <AppText color="text2">{t('sa.withoutMethodSub')}</AppText>
              </View>
            </View>
            <Button
              variant="secondary"
              icon={Send}
              title={t('sa.remindButton')}
              loading={reminding}
              onPress={() => void remind()}
            />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
