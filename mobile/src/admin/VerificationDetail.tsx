import { useQueryClient } from '@tanstack/react-query';
import { Check, Phone, X } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, ScrollView, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { endpoints } from '../api/endpoints';
import { queryKeys, useAdminVerification } from '../api/queries';
import { useErrorText } from '../api/use-error-text';
import { AppText } from '../components/AppText';
import { Avatar } from '../components/ui/Avatar';
import { BarHeader } from '../components/ui/BarHeader';
import { BottomSheet } from '../components/ui/BottomSheet';
import { Button } from '../components/ui/Button';
import { BoxField } from '../components/ui/BoxField';
import { Card, Separator } from '../components/ui/Card';
import { TextField } from '../components/ui/TextField';
import { formatDate } from '../lib/format';
import { formatBirthDateInput, initials } from '../lib/input';
import { leave } from '../lib/navigation';
import { showNotice } from '../lib/notice';
import { OrderPlaceholder } from '../orders/OrderParts';
import { useTheme } from '../theme/ThemeProvider';

/** "DD.MM.YYYY" → ISO, only when the date is strictly after `today` (a `valid_until`). */
function futureDateToIso(text: string, today: Date = new Date()): string | null {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text);
  if (!match) return null;
  const [, dd, mm, yyyy] = match as unknown as [string, string, string, string];
  const date = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
  const valid =
    date.getUTCFullYear() === Number(yyyy) &&
    date.getUTCMonth() === Number(mm) - 1 &&
    date.getUTCDate() === Number(dd) &&
    date.getTime() > today.getTime();
  return valid ? date.toISOString() : null;
}

/** AD1 item: certificate photo or Xolis QR + phone, approve (with `valid_until`) or reject. */
export function VerificationDetail({ id }: { id: string }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const errorText = useErrorText();
  const client = useQueryClient();
  const item = useAdminVerification(id);
  const [validUntil, setValidUntil] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);

  if (!item.data) {
    return (
      <OrderPlaceholder
        error={item.isError ? errorText(item.error) : null}
        onRetry={() => void item.refetch()}
      />
    );
  }
  const data = item.data;
  const decided = data.status !== 'PENDING';
  const iso = futureDateToIso(validUntil);
  const needsDate = data.method === 'SELF_EMPLOYED';

  const decide = async (
    decision:
      { decision: 'APPROVE'; valid_until?: string } | { decision: 'REJECT'; reason: string },
  ) => {
    setBusy(decision.decision === 'APPROVE' ? 'approve' : 'reject');
    try {
      await endpoints.adminVerificationDecide(id, decision);
      void client.invalidateQueries({ queryKey: queryKeys.adminVerifications });
      void client.invalidateQueries({ queryKey: queryKeys.adminVerification(id) });
      leave('/admin/verifications');
    } catch (error) {
      showNotice(errorText(error));
    } finally {
      setBusy(null);
    }
  };

  const name = `${data.user.first_name} ${data.user.last_name}`.trim() || data.user.phone_masked;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg2 }}>
      <BarHeader title={t('admin.verificationTitle')} />
      <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
            <Avatar initials={initials(data.user.first_name, data.user.last_name)} size={56} />
            <View style={{ flex: 1 }}>
              <AppText size="bodyLarge" weight="bold">
                {name}
              </AppText>
              <AppText color="text2">{data.user.phone_masked}</AppText>
            </View>
          </View>
          <Separator />
          <RowLine label={t('tax.statusMethod')} value={t(`tax.method.${data.method}`)} />
          <RowLine
            label={t('admin.verificationSubmitted')}
            value={formatDate(new Date(data.created_at))}
          />
          {decided ? (
            <RowLine
              label={t('admin.verificationStatus')}
              value={t(`admin.verificationStatusValue.${data.status}`)}
            />
          ) : null}
        </Card>

        {data.method === 'SELF_EMPLOYED' ? (
          <Card title={t('admin.certificateTitle')}>
            {data.certificate_url ? (
              <Image
                source={{ uri: data.certificate_url }}
                accessibilityIgnoresInvertColors
                style={{ width: '100%', height: 260, borderRadius: theme.radius.md }}
                resizeMode="contain"
              />
            ) : (
              <AppText color="text2">{t('admin.certificateMissing')}</AppText>
            )}
          </Card>
        ) : (
          <Card title={t('admin.xolisTitle')}>
            {data.xolis_qr ? (
              <View
                style={{
                  alignSelf: 'center',
                  padding: theme.spacing.lg,
                  borderRadius: theme.radius.card,
                  backgroundColor: theme.colors.qrBg,
                }}
              >
                <QRCode value={data.xolis_qr} size={160} />
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
              <Phone size={18} color={theme.colors.text2} />
              <AppText size="bodyLarge">{data.xolis_phone ?? '—'}</AppText>
            </View>
          </Card>
        )}

        {!decided && needsDate ? (
          <TextField
            label={t('admin.validUntilLabel')}
            placeholder={t('identity.birthDatePlaceholder')}
            value={validUntil}
            onChangeText={(text) => setValidUntil(formatBirthDateInput(text))}
            keyboardType="number-pad"
            error={validUntil.length === 10 && !iso ? t('admin.validUntilInvalid') : undefined}
          />
        ) : null}
      </ScrollView>

      {!decided ? (
        <View
          style={{
            padding: theme.spacing.lg,
            gap: theme.spacing.sm,
            paddingBottom: insets.bottom + theme.spacing.sm,
            borderTopWidth: 1,
            borderTopColor: theme.colors.sep,
            backgroundColor: theme.colors.bg,
          }}
        >
          <Button
            icon={Check}
            title={t('admin.approve')}
            loading={busy === 'approve'}
            disabled={busy !== null || (needsDate && !iso)}
            onPress={() => void decide({ decision: 'APPROVE', valid_until: iso ?? undefined })}
          />
          <Button
            variant="secondary"
            icon={X}
            title={t('admin.reject')}
            disabled={busy !== null}
            onPress={() => setRejecting(true)}
            style={{ backgroundColor: theme.colors.redSoft }}
          />
        </View>
      ) : null}

      <BottomSheet
        visible={rejecting}
        onClose={() => setRejecting(false)}
        footer={
          <>
            <Button
              title={t('admin.rejectConfirm')}
              loading={busy === 'reject'}
              disabled={reason.trim().length === 0}
              onPress={() => void decide({ decision: 'REJECT', reason: reason.trim() })}
              style={{ backgroundColor: theme.colors.red }}
            />
            <Button variant="link" title={t('common.cancel')} onPress={() => setRejecting(false)} />
          </>
        }
      >
        <AppText size="title" weight="bold" accessibilityRole="header">
          {t('admin.rejectTitle')}
        </AppText>
        <BoxField
          label={t('admin.rejectReasonLabel')}
          value={reason}
          onChangeText={setReason}
          maxLength={500}
          multiline
          autoFocus
        />
      </BottomSheet>
    </View>
  );
}

function RowLine({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: theme.spacing.xs,
      }}
    >
      <AppText color="text2">{label}</AppText>
      <AppText weight="bold">{value}</AppText>
    </View>
  );
}
