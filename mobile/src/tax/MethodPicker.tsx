import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { AlertTriangle, Calendar, Check, CircleX, Info } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { ApiError } from '../api/client';
import { endpoints } from '../api/endpoints';
import { queryKeys } from '../api/queries';
import type { TaxMethod, TaxStatus } from '../api/types';
import { useErrorText } from '../api/use-error-text';
import { AppText } from '../components/AppText';
import { Button } from '../components/ui/Button';
import { Card, Separator } from '../components/ui/Card';
import { formatPercent } from '../lib/format';
import { showNotice } from '../lib/notice';
import { useOrderTexts } from '../orders/texts';
import { useTheme } from '../theme/ThemeProvider';
import type { ColorToken } from '../theme/tokens';
import { taxMethodExample } from './amounts';

/** Design order (docs/03 SA5/BJ8): self-employed first, then Paynet Xolis. */
const METHOD_ORDER: TaxMethod[] = ['SELF_EMPLOYED', 'XOLIS'];

interface MethodPickerProps {
  methods: TaxMethod[];
  feeBps: number;
  preselect: TaxMethod | null;
  rejected: TaxStatus['rejected'];
  expired: boolean;
  onChosen: () => void;
}

/**
 * BJ8 "Bepul oy tugadi": choose a tax method, only the ones `tax_methods_enabled` lists.
 * Also reused to resubmit after a rejection or an expired certificate (docs/01 §9).
 */
export function MethodPicker({
  methods,
  feeBps,
  preselect,
  rejected,
  expired,
  onChosen,
}: MethodPickerProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const texts = useOrderTexts();
  const errorText = useErrorText();
  const client = useQueryClient();
  const ordered = METHOD_ORDER.filter((method) => methods.includes(method));
  const [selected, setSelected] = useState<TaxMethod | null>(preselect ?? ordered[0] ?? null);
  const [submitting, setSubmitting] = useState(false);
  const example = taxMethodExample(feeBps);

  const submitSelfEmployed = async () => {
    setSubmitting(true);
    try {
      const next = await endpoints.taxSelfEmployed();
      client.setQueryData(queryKeys.taxStatus, next);
      onChosen();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'TAX_CERTIFICATE_REQUIRED') {
        onChosen();
        router.push('/tax/self-employed');
      } else {
        showNotice(errorText(error));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const submit = () => {
    if (selected === 'XOLIS') {
      onChosen();
      router.push('/tax/xolis');
    } else if (selected === 'SELF_EMPLOYED') {
      void submitSelfEmployed();
    }
  };

  const notice = rejected
    ? {
        icon: CircleX,
        color: 'red' as ColorToken,
        bg: 'redSoft' as ColorToken,
        title: t('tax.rejectedTitle'),
        subtitle: rejected.reason ?? t('tax.rejectedGeneric'),
      }
    : expired
      ? {
          icon: AlertTriangle,
          color: 'orange' as ColorToken,
          bg: 'orangeSoft' as ColorToken,
          title: t('tax.expiredTitle'),
          subtitle: t('tax.expiredSubtitle'),
        }
      : {
          icon: Calendar,
          color: 'orange' as ColorToken,
          bg: 'orangeSoft' as ColorToken,
          title: t('tax.pickerTitle'),
          subtitle: t('tax.pickerSubtitle'),
        };

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <Card>
        <View style={{ flexDirection: 'row', gap: theme.spacing.md, alignItems: 'center' }}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: theme.radius.md,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors[notice.bg],
            }}
          >
            <notice.icon size={24} color={theme.colors[notice.color]} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText size="bodyLarge" weight="bold">
              {notice.title}
            </AppText>
            <AppText color="text2">{notice.subtitle}</AppText>
          </View>
        </View>
      </Card>

      {ordered.map((method, index) => {
        const isSelected = selected === method;
        return (
          <Pressable
            key={method}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected }}
            onPress={() => setSelected(method)}
            style={{
              padding: theme.spacing.lg + 2,
              gap: theme.spacing.sm,
              borderRadius: theme.radius.card,
              borderWidth: isSelected ? 2 : 1,
              borderColor: isSelected ? theme.colors.brand : theme.colors.sep,
              backgroundColor: theme.colors.surface,
            }}
          >
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
              {method === 'XOLIS' ? (
                <View
                  style={{
                    paddingHorizontal: theme.spacing.sm,
                    paddingVertical: 4,
                    borderRadius: 999,
                    backgroundColor: theme.colors.greenSoft,
                  }}
                >
                  <AppText size="caption" weight="semibold" color="green">
                    {t('tax.autoBadge')}
                  </AppText>
                </View>
              ) : null}
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  borderWidth: isSelected ? 7 : 2,
                  borderColor: isSelected ? theme.colors.brand : theme.colors.border,
                  backgroundColor: theme.colors.bg,
                }}
              />
            </View>
            <AppText color="text2">{t(`tax.methodDesc.${method}`)}</AppText>
            <Separator />
            <View style={{ gap: 2 }}>
              <AppText size="secondary" color="text2">
                {t('tax.exampleLine', { amount: texts.amount(example.amount) })}
              </AppText>
              <ExampleRow label={t('tax.exampleFee')} value={texts.money(example.fee)} />
              <ExampleRow
                label={t(method === 'XOLIS' ? 'tax.exampleTaxXolis' : 'tax.exampleTaxSelf')}
                value={texts.money(example.tax)}
              />
            </View>
          </Pressable>
        );
      })}

      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        <Info size={20} color={theme.colors.brandText} style={{ marginTop: 1 }} />
        <AppText color="text2" style={{ flex: 1 }}>
          {t('tax.pickerNote', { percent: formatPercent(feeBps) })}
        </AppText>
      </View>

      <Button
        title={t(selected === 'XOLIS' ? 'tax.connectXolis' : 'tax.chooseSelfEmployed')}
        icon={Check}
        loading={submitting}
        disabled={selected === null}
        onPress={submit}
      />
    </View>
  );
}

function ExampleRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <AppText size="secondary" color="text2">
        {label}
      </AppText>
      <AppText size="secondary" weight="bold">
        {value}
      </AppText>
    </View>
  );
}
