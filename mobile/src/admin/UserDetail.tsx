import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Ban, CheckCircle2 } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { endpoints } from '../api/endpoints';
import { queryKeys, useAdminUser } from '../api/queries';
import { useErrorText } from '../api/use-error-text';
import { AppText } from '../components/AppText';
import { Avatar } from '../components/ui/Avatar';
import { BarHeader } from '../components/ui/BarHeader';
import { BottomSheet } from '../components/ui/BottomSheet';
import { Button } from '../components/ui/Button';
import { BoxField } from '../components/ui/BoxField';
import { Card, Separator } from '../components/ui/Card';
import { Tag } from '../components/ui/Chip';
import { formatDate, formatPhone } from '../lib/format';
import { initials } from '../lib/input';
import { showNotice } from '../lib/notice';
import { OrderPlaceholder } from '../orders/OrderParts';
import { useOrderTexts } from '../orders/texts';
import { useTheme } from '../theme/ThemeProvider';

/** AD2 detail: identity, tax, wallet and order counts, block / unblock with a reason. */
export function UserDetail({ id }: { id: string }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const errorText = useErrorText();
  const texts = useOrderTexts();
  const client = useQueryClient();
  const item = useAdminUser(id);
  const [blocking, setBlocking] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  if (!item.data) {
    return (
      <OrderPlaceholder
        error={item.isError ? errorText(item.error) : null}
        onRetry={() => void item.refetch()}
      />
    );
  }
  const data = item.data;
  const name = `${data.identity?.first_name ?? ''} ${data.identity?.last_name ?? ''}`.trim();

  const refresh = (updated: typeof data) => {
    client.setQueryData(queryKeys.adminUser(id), updated);
    void client.invalidateQueries({ queryKey: queryKeys.adminUsers({}) });
  };

  const block = async () => {
    if (!reason.trim()) return;
    setBusy(true);
    try {
      refresh(await endpoints.blockUser(id, reason.trim()));
      setBlocking(false);
      setReason('');
    } catch (error) {
      showNotice(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const unblock = async () => {
    setBusy(true);
    try {
      refresh(await endpoints.unblockUser(id));
    } catch (error) {
      showNotice(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg2 }}>
      <BarHeader title={t('admin.userDetailTitle')} />
      <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
            <Avatar
              initials={initials(data.identity?.first_name, data.identity?.last_name)}
              size={56}
            />
            <View style={{ flex: 1 }}>
              <AppText size="bodyLarge" weight="bold">
                {name || formatPhone(data.phone)}
              </AppText>
              <AppText color="text2">{formatPhone(data.phone)}</AppText>
            </View>
            <Tag
              label={t(
                data.status === 'BLOCKED' ? 'admin.usersStatusBlocked' : 'admin.usersStatusActive',
              )}
              tone={data.status === 'BLOCKED' ? 'red' : 'green'}
            />
          </View>
          <Separator />
          <Row label={t('admin.userEmail')} value={data.email} />
          <Row
            label={t('admin.userRole')}
            value={
              data.active_role
                ? t(data.active_role === 'EXECUTOR' ? 'role.executor' : 'role.customer')
                : '—'
            }
          />
          <Row label={t('admin.userCreatedAt')} value={formatDate(new Date(data.created_at))} />
        </Card>

        <Card title={t('admin.userIdentitySection')}>
          {data.identity ? (
            <>
              <Row
                label={t('admin.userIdentityVerifiedAt')}
                value={formatDate(new Date(data.identity.verified_at))}
              />
              <Row label={t('identity.birthDatePlaceholder')} value={data.identity.birth_date} />
            </>
          ) : (
            <AppText color="text2">{t('admin.userIdentityMissing')}</AppText>
          )}
        </Card>

        {data.executor ? (
          <Card title={t('admin.userTaxMethod')}>
            <Row
              label={t('admin.userTaxMethod')}
              value={data.executor.tax_method ? t(`tax.method.${data.executor.tax_method}`) : '—'}
            />
            <Row
              label={t('admin.userTaxStatus')}
              value={
                data.executor.tax_status
                  ? t(`admin.verificationStatusValue.${data.executor.tax_status}`)
                  : '—'
              }
            />
            {data.executor.tax_status === 'PENDING' ? (
              <Button
                variant="secondary"
                title={t('admin.userVerificationOpen')}
                onPress={() => router.push('/admin/verifications')}
              />
            ) : null}
          </Card>
        ) : null}

        <Card title={t('admin.userWalletSection')}>
          <Row label={t('admin.userWalletReal')} value={texts.money(data.wallet.real)} />
          <Row label={t('admin.userWalletDemo')} value={texts.money(data.wallet.demo)} />
          <Row label={t('admin.userWalletHolds')} value={texts.money(data.wallet.holds)} />
        </Card>

        <Card title={t('admin.userOrdersSection')}>
          <Row
            label={t('admin.userOrdersAsCustomer')}
            value={String(data.orders_count.as_customer)}
          />
          <Row
            label={t('admin.userOrdersAsExecutor')}
            value={String(data.orders_count.as_executor)}
          />
        </Card>

        {data.block ? (
          <Card title={t('admin.userBlockedSection')}>
            <Row
              label={t('admin.userBlockedAt')}
              value={formatDate(new Date(data.block.blocked_at))}
            />
            <Row label={t('admin.userBlockedReason')} value={data.block.reason} />
          </Card>
        ) : null}

        {data.status === 'BLOCKED' ? (
          <Button
            icon={CheckCircle2}
            title={t('admin.userUnblockButton')}
            loading={busy}
            onPress={() => void unblock()}
          />
        ) : (
          <Button
            icon={Ban}
            title={t('admin.userBlockButton')}
            onPress={() => setBlocking(true)}
            style={{ backgroundColor: theme.colors.red }}
          />
        )}
      </ScrollView>

      <BottomSheet
        visible={blocking}
        onClose={() => setBlocking(false)}
        footer={
          <>
            <Button
              title={t('admin.userBlockConfirm')}
              loading={busy}
              disabled={reason.trim().length === 0}
              onPress={() => void block()}
              style={{ backgroundColor: theme.colors.red }}
            />
            <Button variant="link" title={t('common.cancel')} onPress={() => setBlocking(false)} />
          </>
        }
      >
        <AppText size="title" weight="bold" accessibilityRole="header">
          {t('admin.userBlockTitle')}
        </AppText>
        <BoxField
          label={t('admin.userBlockReasonLabel')}
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

function Row({ label, value }: { label: string; value: string }) {
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
