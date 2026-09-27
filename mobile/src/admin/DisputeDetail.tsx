import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Map as MapIcon } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { endpoints } from '../api/endpoints';
import { queryKeys, useAdminDispute, useAdminDisputeTrack } from '../api/queries';
import type { DisputeDecisionValue } from '../api/types';
import { useErrorText } from '../api/use-error-text';
import { AppText } from '../components/AppText';
import { BarHeader } from '../components/ui/BarHeader';
import { BottomSheet } from '../components/ui/BottomSheet';
import { Button } from '../components/ui/Button';
import { BoxField } from '../components/ui/BoxField';
import { Card, Separator } from '../components/ui/Card';
import { Tag } from '../components/ui/Chip';
import { formatOrderNumber, formatPercent } from '../lib/format';
import { showNotice } from '../lib/notice';
import { OrderPlaceholder } from '../orders/OrderParts';
import { PaymentTag } from '../orders/PaymentTag';
import { useOrderTexts } from '../orders/texts';
import { DisputeTrackMap } from './DisputeTrackMap';
import { disputeDecisionOptions, disputeNeedsApproval, partialPrice } from './dispute-decision';
import { isSuperAdmin } from './permissions';
import { useSession } from '../store/session';
import { useTheme } from '../theme/ThemeProvider';

/** AD3 detail: both sides' notes, order summary, decision UI, and (super admin) approve/reject. */
export function DisputeDetail({ orderId }: { orderId: string }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const errorText = useErrorText();
  const texts = useOrderTexts();
  const client = useQueryClient();
  const user = useSession((state) => state.user);
  const superAdmin = user ? isSuperAdmin(user) : false;
  const item = useAdminDispute(orderId);
  const [note, setNote] = useState('');
  const [decision, setDecision] = useState<DisputeDecisionValue | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [trackOpen, setTrackOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Only a super admin can read `/sa/settings` — a plain admin sees PARTIAL without the
  // computed preview price rather than firing a request that always 403s.
  const settings = useQuery({
    queryKey: queryKeys.saSettings,
    queryFn: endpoints.saSettings,
    enabled: superAdmin,
  });
  const disputePartialBps = settings.data?.rates.dispute_partial_bps;

  if (!item.data) {
    return (
      <OrderPlaceholder
        error={item.isError ? errorText(item.error) : null}
        onRetry={() => void item.refetch()}
      />
    );
  }
  const { order, dispute } = item.data;
  const options = disputeDecisionOptions(order.payment_method);
  const openerName =
    dispute.opened_by === 'CUSTOMER'
      ? texts.customerName(order.customer)
      : order.executor
        ? texts.executorShort(order.executor)
        : t('admin.disputeOpenedByEXECUTOR');

  const refresh = (updated: typeof item.data) => {
    client.setQueryData(queryKeys.adminDispute(orderId), updated);
    void client.invalidateQueries({ queryKey: queryKeys.adminDisputes(undefined) });
    void client.invalidateQueries({ queryKey: queryKeys.saDisputesPendingApproval });
  };

  const submit = async () => {
    if (!decision) return;
    setBusy(true);
    try {
      refresh(await endpoints.decideDispute(orderId, decision, note.trim() || undefined));
      setDecision(null);
      setNote('');
      showNotice(t('admin.disputeSubmitted'));
    } catch (error) {
      showNotice(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    setBusy(true);
    try {
      refresh(await endpoints.approveDispute(orderId));
    } catch (error) {
      showNotice(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    if (!rejectReason.trim()) return;
    setBusy(true);
    try {
      refresh(await endpoints.rejectDispute(orderId, rejectReason.trim()));
      setRejecting(false);
      setRejectReason('');
    } catch (error) {
      showNotice(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg2 }}>
      <BarHeader
        title={t('admin.disputeTitle', { number: formatOrderNumber(order.number) })}
        subtitle={texts.ago(dispute.opened_at)}
      />
      <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}>
        <Card>
          <AppText size="bodyLarge" weight="bold" numberOfLines={1}>
            {texts.category(order.category)} · {order.title}
          </AppText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <AppText size="bodyLarge" weight="bold">
              {texts.money(order.price)}
            </AppText>
            <PaymentTag method={order.payment_method} long />
            {dispute.payment_hold_active ? (
              <Tag label={t('admin.disputePaymentHeld')} tone="orange" />
            ) : null}
          </View>
          <Separator inset={0} />
          <Button
            variant="secondary"
            icon={MapIcon}
            title={t('admin.disputeTrackButton')}
            onPress={() => setTrackOpen(true)}
          />
        </Card>

        <Card title={t('admin.disputeNotesSection')}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <AppText weight="bold">{openerName}</AppText>
            <AppText color="text2" size="secondary">
              ·{' '}
              {t(
                dispute.opened_by === 'CUSTOMER'
                  ? 'admin.disputeSideCUSTOMER'
                  : 'admin.disputeSideEXECUTOR',
              )}
            </AppText>
            <AppText color="text2" size="secondary" style={{ marginLeft: 'auto' }}>
              {texts.clock(dispute.opened_at)}
            </AppText>
          </View>
          <AppText color={dispute.note ? 'text' : 'text2'}>
            {dispute.note ?? t('admin.disputeNoNote')}
          </AppText>
        </Card>

        {dispute.decision ? (
          <Card title={t('admin.disputeDecisionLabel')}>
            <RowLine
              label={t('admin.disputeDecisionLabel')}
              value={t(
                dispute.decision === 'PARTIAL'
                  ? 'admin.disputeDecisionPARTIALShort'
                  : `admin.disputeDecision${dispute.decision}`,
              )}
            />
            {dispute.original_price ? (
              <RowLine
                label={t('admin.disputeOriginalPrice')}
                value={texts.money(dispute.original_price)}
              />
            ) : null}
            <RowLine
              label={t('admin.disputeDecisionSection')}
              value={t(`admin.disputeApproval${dispute.approval}`)}
            />
            {dispute.approval === 'REJECTED' && dispute.rejected_reason ? (
              <RowLine label={t('admin.disputeRejectReason')} value={dispute.rejected_reason} />
            ) : null}
            {superAdmin && dispute.approval === 'PENDING' ? (
              <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                <Button
                  title={t('admin.disputeApprove')}
                  loading={busy}
                  onPress={() => void approve()}
                  style={{ flex: 1 }}
                />
                <Button
                  variant="secondary"
                  title={t('admin.disputeReject')}
                  disabled={busy}
                  onPress={() => setRejecting(true)}
                  style={{ flex: 1, backgroundColor: theme.colors.redSoft }}
                />
              </View>
            ) : null}
          </Card>
        ) : (
          <Card title={t('admin.disputeDecisionSection')}>
            {options.map((option) => {
              const needsApproval = disputeNeedsApproval(option, superAdmin);
              const partialKnown = option === 'PARTIAL' && disputePartialBps !== undefined;
              const label =
                option === 'PARTIAL'
                  ? partialKnown
                    ? t('admin.disputeDecisionPARTIAL', {
                        percent: formatPercent(disputePartialBps!),
                      })
                    : t('admin.disputeDecisionPARTIALShort')
                  : t(`admin.disputeDecision${option}`);
              const preview =
                option === 'FULL'
                  ? texts.amount(order.price)
                  : partialKnown
                    ? texts.amount(partialPrice(order.price, disputePartialBps!))
                    : null;
              return (
                <DecisionRow
                  key={option}
                  label={label}
                  value={preview}
                  note={needsApproval ? t('admin.disputeNeedsApproval') : undefined}
                  selected={decision === option}
                  onPress={() => setDecision(option)}
                />
              );
            })}
            <BoxField
              label={t('admin.disputeDecisionNoteLabel')}
              value={note}
              onChangeText={setNote}
              maxLength={500}
              multiline
            />
            <Button
              title={t('admin.disputeSubmit')}
              loading={busy}
              disabled={!decision}
              onPress={() => void submit()}
            />
          </Card>
        )}
      </ScrollView>

      <BottomSheet
        visible={rejecting}
        onClose={() => setRejecting(false)}
        footer={
          <>
            <Button
              title={t('admin.disputeReject')}
              loading={busy}
              disabled={rejectReason.trim().length === 0}
              onPress={() => void reject()}
              style={{ backgroundColor: theme.colors.red }}
            />
            <Button variant="link" title={t('common.cancel')} onPress={() => setRejecting(false)} />
          </>
        }
      >
        <AppText size="title" weight="bold" accessibilityRole="header">
          {t('admin.disputeRejectTitle')}
        </AppText>
        <BoxField
          label={t('admin.disputeRejectReason')}
          value={rejectReason}
          onChangeText={setRejectReason}
          maxLength={500}
          multiline
          autoFocus
        />
      </BottomSheet>

      <Modal visible={trackOpen} animationType="slide" onRequestClose={() => setTrackOpen(false)}>
        <TrackScreen orderId={orderId} enabled={trackOpen} onClose={() => setTrackOpen(false)} />
      </Modal>
    </View>
  );
}

function TrackScreen({
  orderId,
  enabled,
  onClose,
}: {
  orderId: string;
  enabled: boolean;
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const errorText = useErrorText();
  const track = useAdminDisputeTrack(orderId, enabled);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg2 }}>
      <BarHeader title={t('admin.disputeTrackTitle')} onBack={onClose} />
      {track.data && track.data.points.length > 0 ? (
        <View style={{ flex: 1 }}>
          <DisputeTrackMap points={track.data.points} />
          {track.data.end_reason ? (
            <View
              style={{
                position: 'absolute',
                left: theme.spacing.lg,
                right: theme.spacing.lg,
                bottom: insets.bottom + theme.spacing.lg,
                padding: theme.spacing.md,
                borderRadius: theme.radius.card,
                backgroundColor: theme.colors.surface,
              }}
            >
              <AppText color="text2">
                {t('admin.disputeTrackEndReason')}:{' '}
                {t(`admin.tripEndReason.${track.data.end_reason}`)}
              </AppText>
            </View>
          ) : null}
        </View>
      ) : (
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: theme.spacing.xl,
          }}
        >
          {track.isPending ? null : (
            <AppText color="text2">
              {track.isError ? errorText(track.error) : t('admin.disputeTrackEmpty')}
            </AppText>
          )}
        </View>
      )}
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

function DecisionRow({
  label,
  value,
  note,
  selected,
  onPress,
}: {
  label: string;
  value: string | null;
  note?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        gap: 4,
        padding: theme.spacing.md,
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: selected ? theme.colors.brand : theme.colors.sep,
        backgroundColor: selected ? theme.colors.brandSoft : theme.colors.bg,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <View
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            borderWidth: 2,
            borderColor: selected ? theme.colors.brand : theme.colors.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {selected ? (
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: theme.colors.brand,
              }}
            />
          ) : null}
        </View>
        <AppText weight={selected ? 'bold' : 'medium'} style={{ flex: 1 }}>
          {label}
        </AppText>
        {value ? <AppText color="text2">{value}</AppText> : null}
      </View>
      {note ? (
        <AppText color="orange" size="secondary" style={{ paddingLeft: 32 }}>
          {note}
        </AppText>
      ) : null}
    </Pressable>
  );
}
