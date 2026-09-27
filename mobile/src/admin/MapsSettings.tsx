import { useQueryClient } from '@tanstack/react-query';
import { Check, Map as MapIcon } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Switch, TextInput, View } from 'react-native';
import { endpoints } from '../api/endpoints';
import { queryKeys, useMapsOverview } from '../api/queries';
import type { MapsSettings as MapsSettingsValues } from '../api/types';
import { useErrorText } from '../api/use-error-text';
import { AppText } from '../components/AppText';
import { BarHeader, BarIconButton } from '../components/ui/BarHeader';
import { Card, Separator } from '../components/ui/Card';
import { Tag } from '../components/ui/Chip';
import { showNotice } from '../lib/notice';
import { OrderPlaceholder } from '../orders/OrderParts';
import { useTheme } from '../theme/ThemeProvider';

type FieldKey = keyof MapsSettingsValues;

const toStrings = (settings: MapsSettingsValues): Record<FieldKey, string> =>
  Object.fromEntries(
    Object.entries(settings).map(([key, value]) => [key, String(value)]),
  ) as Record<FieldKey, string>;

/** SA6 "Xarita va joylashuv" (super admin only, `docs/03` row SA6). */
export function MapsSettings() {
  const theme = useTheme();
  const { t } = useTranslation();
  const errorText = useErrorText();
  const client = useQueryClient();
  const overview = useMapsOverview();
  const [values, setValues] = useState<Record<FieldKey, string> | null>(null);
  const [saving, setSaving] = useState(false);

  // Seeds the editable fields once the settings load, adjusting state during render rather
  // than in an Effect (react.dev "Adjusting state when a prop changes"): the condition below
  // only holds until `values` is set, so this runs (and re-renders) exactly once per load.
  if (overview.data && values === null) {
    setValues(toStrings(overview.data.settings));
  }

  if (!overview.data || values === null) {
    return (
      <OrderPlaceholder
        error={overview.isError ? errorText(overview.error) : null}
        onRetry={() => void overview.refetch()}
      />
    );
  }
  const data = overview.data;
  const dirty = JSON.stringify(values) !== JSON.stringify(toStrings(data.settings));

  const field = (key: FieldKey) => (text: string) =>
    setValues((prev) => (prev ? { ...prev, [key]: text.replace(/[^0-9]/g, '') } : prev));

  const save = async () => {
    const parsed: Partial<Record<FieldKey, number>> = {};
    for (const [key, text] of Object.entries(values)) {
      const n = Number.parseInt(text, 10);
      if (!Number.isFinite(n) || n <= 0) {
        showNotice(t('sa.mapsInvalid'));
        return;
      }
      parsed[key as FieldKey] = n;
    }
    setSaving(true);
    try {
      const updated = await endpoints.setMapsSettings(parsed);
      client.setQueryData(queryKeys.mapsOverview, updated);
      setValues(toStrings(updated.settings));
      showNotice(t('sa.mapsSaved'));
    } catch (error) {
      showNotice(errorText(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg2 }}>
      <BarHeader
        title={t('sa.mapsTitle')}
        right={
          dirty && !saving ? (
            <BarIconButton icon={Check} label={t('sa.mapsSave')} onPress={() => void save()} />
          ) : undefined
        }
      />
      <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}>
        <Card title={t('sa.mapsServiceSection')}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: theme.radius.md,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.brandSoft,
              }}
            >
              <MapIcon size={22} color={theme.colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText size="bodyLarge" weight="bold">
                {t('sa.mapsProviderName')}
              </AppText>
              <AppText color="text2">{t('sa.mapsProviderDesc')}</AppText>
            </View>
            <Tag
              label={t(data.provider === 'google' ? 'sa.mapsConnected' : 'sa.mapsMock')}
              tone={data.provider === 'google' ? 'green' : 'neutral'}
            />
          </View>
          <Separator inset={0} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
            <View style={{ flex: 1 }}>
              <AppText size="bodyLarge" weight="bold">
                {t('sa.mapsApiKeyLabel')}
              </AppText>
              <AppText color="text2">{t('sa.mapsApiKeyHint')}</AppText>
            </View>
            <Tag
              label={t(
                data.server_key_configured ? 'sa.mapsApiKeyConfigured' : 'sa.mapsApiKeyMissing',
              )}
              tone={data.server_key_configured ? 'green' : 'orange'}
            />
          </View>
          <Separator inset={0} />
          <AppText weight="semibold">{t('sa.mapsUsageSection')}</AppText>
          <UsageRow label={t('sa.mapsUsageRoutes')} value={data.usage_this_month.routes} />
          <UsageRow label={t('sa.mapsUsageGeocode')} value={data.usage_this_month.geocode} />
          <UsageRow label={t('sa.mapsUsagePlaces')} value={data.usage_this_month.places} />
        </Card>

        <Card title={t('sa.mapsLiveSection')}>
          <NumberField
            label={t('sa.mapsIntervalLabel')}
            hint={t('sa.mapsIntervalHint')}
            unit={t('sa.mapsSeconds')}
            value={values.location_interval_sec}
            onChangeText={field('location_interval_sec')}
          />
          <Separator inset={0} />
          <NumberField
            label={t('sa.mapsEtaRefreshLabel')}
            hint={t('sa.mapsEtaRefreshHint')}
            unit={t('sa.mapsSeconds')}
            value={values.eta_refresh_sec}
            onChangeText={field('eta_refresh_sec')}
          />
          <Separator inset={0} />
          <NumberField
            label={t('sa.mapsDeviationLabel')}
            hint={t('sa.mapsDeviationHint')}
            unit={t('sa.mapsMeters')}
            value={values.route_deviation_m}
            onChangeText={field('route_deviation_m')}
          />
          <Separator inset={0} />
          <NumberField
            label={t('sa.mapsAutoStopLabel')}
            hint={t('sa.mapsAutoStopHint')}
            unit={t('sa.mapsMeters')}
            value={values.auto_stop_radius_m}
            onChangeText={field('auto_stop_radius_m')}
          />
          <Separator inset={0} />
          <NumberField
            label={t('sa.mapsMaxTripLabel')}
            hint={t('sa.mapsMaxTripHint')}
            unit={t('sa.mapsMinutes')}
            value={values.max_trip_minutes}
            onChangeText={field('max_trip_minutes')}
          />
          <Separator inset={0} />
          <View>
            <AppText size="bodyLarge" weight="bold">
              {t('sa.mapsSharingStartsLabel')}
            </AppText>
            <AppText color="brandText">{t('sa.mapsSharingStartsValue')}</AppText>
          </View>
          <Separator inset={0} />
          <ToggleRow label={t('sa.mapsAddressVisibleLabel')} />
        </Card>

        <Card title={t('sa.mapsPrivacySection')}>
          <NumberField
            label={t('sa.mapsRetentionLabel')}
            hint={t('sa.mapsRetentionHint')}
            unit={t('sa.mapsDays')}
            value={values.track_retention_days}
            onChangeText={field('track_retention_days')}
          />
          <Separator inset={0} />
          <ToggleRow label={t('sa.mapsAdminsHideLabel')} />
        </Card>
      </ScrollView>
    </View>
  );
}

function UsageRow({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <AppText color="text2">{label}</AppText>
      <AppText weight="bold">{value}</AppText>
    </View>
  );
}

function NumberField({
  label,
  hint,
  unit,
  value,
  onChangeText,
}: {
  label: string;
  hint: string;
  unit: string;
  value: string;
  onChangeText: (text: string) => void;
}) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
      <View style={{ flex: 1 }}>
        <AppText size="bodyLarge" weight="bold">
          {label}
        </AppText>
        <AppText color="text2">{hint}</AppText>
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
          minHeight: theme.size.buttonSecondary,
          paddingHorizontal: theme.spacing.md,
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.lg,
        }}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          keyboardType="number-pad"
          maxLength={6}
          accessibilityLabel={label}
          style={{
            minWidth: 36,
            textAlign: 'right',
            paddingVertical: 4,
            fontFamily: theme.fontFamily.bold,
            fontSize: theme.fontSize.bodyLarge,
            color: theme.colors.text,
          }}
        />
        <AppText color="text2">{unit}</AppText>
      </View>
    </View>
  );
}

/** Always-on business rules (docs/01 §10, stage6 contract): shown for transparency, not editable. */
function ToggleRow({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
      <AppText size="bodyLarge" weight="bold" style={{ flex: 1 }}>
        {label}
      </AppText>
      <Switch
        value
        disabled
        accessibilityLabel={label}
        trackColor={{ true: theme.colors.brand, false: theme.colors.border }}
        thumbColor={theme.colors.bg}
      />
    </View>
  );
}
