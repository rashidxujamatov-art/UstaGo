import {
  AlertTriangle,
  ArrowLeftRight,
  Bell,
  Check,
  CircleX,
  Clock,
  type LucideIcon,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Switch, View } from 'react-native';
import type { TaxStatus } from '../api/types';
import { AppText } from '../components/AppText';
import { Button } from '../components/ui/Button';
import { Card, Separator } from '../components/ui/Card';
import { formatDate, formatPercent, formatTime } from '../lib/format';
import { useTheme } from '../theme/ThemeProvider';
import type { ColorToken } from '../theme/tokens';

interface StatusCardProps {
  status: TaxStatus;
  feeBps: number;
  reminderDays: number;
  remindersBusy: boolean;
  onToggleReminders: (enabled: boolean) => void;
  onChangeMethod: () => void;
}

/** BJ9 "Soliq holati": VERIFIED / PENDING / REJECTED / EXPIRED for the chosen method. */
export function StatusCard({
  status,
  feeBps,
  reminderDays,
  remindersBusy,
  onToggleReminders,
  onChangeMethod,
}: StatusCardProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  if (!status.method) return null;

  const badge = badgeFor(status.status);
  const dateTime = (iso: string) => `${formatDate(new Date(iso))}, ${formatTime(new Date(iso))}`;

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <Card style={{ alignItems: 'center' }}>
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors[badge.bg],
          }}
        >
          <badge.icon size={36} color={theme.colors[badge.fg]} />
        </View>
        <AppText size="title" weight="bold" style={{ textAlign: 'center' }}>
          {t(badge.titleKey)}
        </AppText>
        <AppText color="text2" style={{ textAlign: 'center' }}>
          {status.status === 'REJECTED'
            ? (status.rejected?.reason ?? t('tax.rejectedGeneric'))
            : t(badge.subtitleKey)}
        </AppText>
      </Card>

      <Card style={{ gap: 0 }}>
        <InfoRow label={t('tax.statusMethod')} value={t(`tax.method.${status.method}`)} />
        {status.valid_until ? (
          <>
            <Separator />
            <InfoRow
              label={t('tax.statusValidUntil')}
              value={t('tax.validUntilValue', { date: formatDate(new Date(status.valid_until)) })}
              valueColor={status.status === 'EXPIRED' ? 'red' : 'green'}
            />
          </>
        ) : null}
        {status.checked_at ? (
          <>
            <Separator />
            <InfoRow label={t('tax.statusChecked')} value={dateTime(status.checked_at)} />
          </>
        ) : null}
        {status.pending ? (
          <>
            <Separator />
            <InfoRow label={t('tax.statusRequested')} value={dateTime(status.pending.created_at)} />
          </>
        ) : null}
      </Card>

      {status.status === 'VERIFIED' ? (
        <View
          style={{
            padding: theme.spacing.lg,
            gap: theme.spacing.xs,
            borderRadius: theme.radius.card,
            backgroundColor: theme.colors.greenSoft,
          }}
        >
          <AppText weight="bold" color="green">
            {t('tax.noWithholding')}
          </AppText>
          <AppText color="text2">
            {t(status.method === 'XOLIS' ? 'tax.noWithholdingXolis' : 'tax.noWithholdingSelf', {
              percent: formatPercent(feeBps),
            })}
          </AppText>
        </View>
      ) : null}

      {status.status === 'VERIFIED' && status.valid_until ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: theme.radius.md,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.redSoft,
              }}
            >
              <Bell size={20} color={theme.colors.red} />
            </View>
            <AppText size="bodyLarge" style={{ flex: 1 }}>
              {t('tax.remindersLabel', { days: reminderDays })}
            </AppText>
            <Switch
              value={status.reminders}
              disabled={remindersBusy}
              accessibilityLabel={t('tax.remindersLabel', { days: reminderDays })}
              trackColor={{ true: theme.colors.brand, false: theme.colors.border }}
              thumbColor={theme.colors.bg}
              onValueChange={onToggleReminders}
            />
          </View>
        </Card>
      ) : null}

      {status.status === 'VERIFIED' ? (
        <Button
          variant="secondary"
          icon={ArrowLeftRight}
          title={t('tax.changeMethod')}
          onPress={onChangeMethod}
        />
      ) : status.status === 'REJECTED' ? (
        <Button title={t('tax.retry')} onPress={onChangeMethod} />
      ) : status.status === 'EXPIRED' ? (
        <Button title={t('tax.renew')} onPress={onChangeMethod} />
      ) : null}
    </View>
  );
}

function InfoRow({
  label,
  value,
  valueColor = 'text',
}: {
  label: string;
  value: string;
  valueColor?: ColorToken;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: theme.spacing.sm,
      }}
    >
      <AppText color="text2">{label}</AppText>
      <AppText weight="bold" color={valueColor}>
        {value}
      </AppText>
    </View>
  );
}

type StatusMessageKey =
  | 'tax.verifiedTitle'
  | 'tax.verifiedSubtitle'
  | 'tax.pendingTitle'
  | 'tax.pendingSubtitle'
  | 'tax.expiredTitle'
  | 'tax.expiredSubtitle'
  | 'tax.rejectedTitle'
  | 'tax.rejectedGeneric';

interface Badge {
  icon: LucideIcon;
  bg: ColorToken;
  fg: ColorToken;
  titleKey: StatusMessageKey;
  subtitleKey: StatusMessageKey;
}

function badgeFor(status: TaxStatus['status']): Badge {
  switch (status) {
    case 'VERIFIED':
      return {
        icon: Check,
        bg: 'greenSoft',
        fg: 'green',
        titleKey: 'tax.verifiedTitle',
        subtitleKey: 'tax.verifiedSubtitle',
      };
    case 'PENDING':
      return {
        icon: Clock,
        bg: 'orangeSoft',
        fg: 'orange',
        titleKey: 'tax.pendingTitle',
        subtitleKey: 'tax.pendingSubtitle',
      };
    case 'EXPIRED':
      return {
        icon: AlertTriangle,
        bg: 'orangeSoft',
        fg: 'orange',
        titleKey: 'tax.expiredTitle',
        subtitleKey: 'tax.expiredSubtitle',
      };
    case 'REJECTED':
    default:
      return {
        icon: CircleX,
        bg: 'redSoft',
        fg: 'red',
        titleKey: 'tax.rejectedTitle',
        subtitleKey: 'tax.rejectedGeneric',
      };
  }
}
