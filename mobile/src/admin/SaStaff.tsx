import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Switch, View } from 'react-native';
import { endpoints } from '../api/endpoints';
import { queryKeys, useSaPermissionRequests, useSaStaff } from '../api/queries';
import type { AdminPermission, AdminPermissionRequestItem, StaffMember } from '../api/types';
import { useErrorText } from '../api/use-error-text';
import { AppText } from '../components/AppText';
import { Avatar } from '../components/ui/Avatar';
import { BarHeader } from '../components/ui/BarHeader';
import { BottomSheet } from '../components/ui/BottomSheet';
import { Button } from '../components/ui/Button';
import { BoxField } from '../components/ui/BoxField';
import { Card, Separator } from '../components/ui/Card';
import { Segmented } from '../components/ui/Segmented';
import { initials } from '../lib/input';
import { showNotice } from '../lib/notice';
import { OrderPlaceholder } from '../orders/OrderParts';
import { useOrderTexts } from '../orders/texts';
import { ADMIN_PERMISSIONS, PERMISSION_DESC_KEYS, PERMISSION_LABEL_KEYS } from './permissions';
import { useTheme } from '../theme/ThemeProvider';

type Tab = 'ADMINS' | 'EXECUTOR' | 'CUSTOMER';

/** SA3 "Rollar va ruxsatlar": staff list, grant by phone, permission toggles, revoke, requests. */
export function SaStaff() {
  const theme = useTheme();
  const { t } = useTranslation();
  const errorText = useErrorText();
  const client = useQueryClient();
  const staff = useSaStaff();
  const requests = useSaPermissionRequests('PENDING');
  const [tab, setTab] = useState<Tab>('ADMINS');
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  if (!staff.data) {
    return (
      <OrderPlaceholder
        error={staff.isError ? errorText(staff.error) : null}
        onRetry={() => void staff.refetch()}
      />
    );
  }
  const list = staff.data;
  const activeId = selected ?? list[0]?.id ?? null;
  const active = list.find((member) => member.id === activeId) ?? null;

  const changeTab = (value: Tab) => {
    if (value === 'ADMINS') {
      setTab(value);
      return;
    }
    router.push({ pathname: '/admin/users', params: { role: value } });
  };

  const togglePermission = async (
    member: StaffMember,
    permission: AdminPermission,
    enabled: boolean,
  ) => {
    const next = enabled
      ? [...member.permissions, permission]
      : member.permissions.filter((item) => item !== permission);
    try {
      const updated = await endpoints.updateStaffPermissions(member.id, next);
      client.setQueryData(queryKeys.saStaff, (all: StaffMember[] | undefined) =>
        (all ?? []).map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (error) {
      showNotice(errorText(error));
    }
  };

  const revoke = async (member: StaffMember) => {
    try {
      await endpoints.revokeStaff(member.id);
      client.setQueryData(queryKeys.saStaff, (all: StaffMember[] | undefined) =>
        (all ?? []).filter((item) => item.id !== member.id),
      );
      setSelected(null);
    } catch (error) {
      showNotice(errorText(error));
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg2 }}>
      <BarHeader title={t('sa.staffTitle')} />
      <View style={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}>
        <Segmented
          value={tab}
          onChange={changeTab}
          options={[
            { value: 'ADMINS', label: t('sa.staffTabAdmins') },
            { value: 'EXECUTOR', label: t('sa.staffTabExecutors') },
            { value: 'CUSTOMER', label: t('sa.staffTabCustomers') },
          ]}
        />
      </View>
      <ScrollView
        contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg, paddingTop: 0 }}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: theme.spacing.sm }}
        >
          {list.map((member) => (
            <StaffPill
              key={member.id}
              member={member}
              selected={member.id === activeId}
              onPress={() => setSelected(member.id)}
            />
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={() => setAdding(true)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: theme.spacing.lg,
              minHeight: theme.size.touchTarget,
              borderRadius: 999,
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: theme.colors.brand,
            }}
          >
            <Plus size={18} color={theme.colors.brand} />
            <AppText weight="bold" color="brandText">
              {t('sa.staffAddButton')}
            </AppText>
          </Pressable>
        </ScrollView>

        {list.length === 0 ? (
          <AppText color="text2" style={{ textAlign: 'center', padding: theme.spacing.xxl }}>
            {t('sa.staffEmpty')}
          </AppText>
        ) : null}

        {active ? (
          <Card
            title={t('sa.staffPermissionsOf', {
              name: `${active.first_name} ${active.last_name}`.trim(),
            })}
          >
            {ADMIN_PERMISSIONS.map((permission, index) => (
              <View key={permission}>
                {index > 0 ? <Separator inset={0} /> : null}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: theme.spacing.md,
                    paddingVertical: theme.spacing.sm,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <AppText weight="bold">{t(PERMISSION_LABEL_KEYS[permission])}</AppText>
                    <AppText color="text2" size="secondary">
                      {t(PERMISSION_DESC_KEYS[permission])}
                    </AppText>
                  </View>
                  <Switch
                    value={active.role === 'SUPER_ADMIN' || active.permissions.includes(permission)}
                    disabled={active.role === 'SUPER_ADMIN'}
                    onValueChange={(value) => void togglePermission(active, permission, value)}
                    accessibilityLabel={t(PERMISSION_LABEL_KEYS[permission])}
                    trackColor={{ true: theme.colors.brand, false: theme.colors.border }}
                    thumbColor={theme.colors.bg}
                  />
                </View>
              </View>
            ))}
            <Separator inset={0} />
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.md,
                paddingVertical: theme.spacing.sm,
              }}
            >
              <View style={{ flex: 1 }}>
                <AppText weight="bold" color="text2">
                  {t('sa.staffSuperAdminLocked')}
                </AppText>
                <AppText color="text2" size="secondary">
                  {t('sa.staffSuperAdminLockedSub')}
                </AppText>
              </View>
            </View>
            {active.role === 'ADMIN' ? (
              <Button
                variant="secondary"
                title={t('sa.staffRevoke')}
                onPress={() => void revoke(active)}
                style={{ backgroundColor: theme.colors.redSoft }}
              />
            ) : null}
          </Card>
        ) : null}

        <Card title={t('sa.staffRequestsTitle')}>
          {requests.isPending ? null : (requests.data ?? []).length === 0 ? (
            <AppText color="text2">{t('sa.staffRequestsEmpty')}</AppText>
          ) : (
            (requests.data ?? []).map((request, index) => (
              <View key={request.id}>
                {index > 0 ? <Separator inset={0} /> : null}
                <PermissionRequestRow request={request} />
              </View>
            ))
          )}
        </Card>
      </ScrollView>

      <AddStaffSheet
        visible={adding}
        onClose={() => setAdding(false)}
        onAdded={(member) => setSelected(member.id)}
      />
    </View>
  );
}

function StaffPill({
  member,
  selected,
  onPress,
}: {
  member: StaffMember;
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
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
        borderRadius: 999,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? theme.colors.brand : theme.colors.sep,
      }}
    >
      <Avatar initials={initials(member.first_name, member.last_name)} size={28} />
      <AppText weight={selected ? 'bold' : 'medium'} numberOfLines={1}>
        {member.first_name || member.phone_masked}
      </AppText>
    </Pressable>
  );
}

function PermissionRequestRow({ request }: { request: AdminPermissionRequestItem }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const texts = useOrderTexts();
  const errorText = useErrorText();
  const client = useQueryClient();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    void client.invalidateQueries({ queryKey: queryKeys.saPermissionRequests('PENDING') });
  };

  const approve = async () => {
    setBusy(true);
    try {
      await endpoints.decidePermissionRequest(request.id, { approve: true });
      refresh();
    } catch (error) {
      showNotice(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    if (!reason.trim()) return;
    setBusy(true);
    try {
      await endpoints.decidePermissionRequest(request.id, {
        approve: false,
        reason: reason.trim(),
      });
      setRejecting(false);
      setReason('');
      refresh();
    } catch (error) {
      showNotice(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ paddingVertical: theme.spacing.sm, gap: theme.spacing.sm }}>
      <View>
        <AppText weight="bold">
          {`${request.requested_by.first_name} ${request.requested_by.last_name}`.trim()}
        </AppText>
        <AppText color="text2">{t(PERMISSION_LABEL_KEYS[request.permission])}</AppText>
        {request.note ? <AppText color="text2">{request.note}</AppText> : null}
        <AppText color="text2" size="secondary">
          {texts.ago(request.created_at)}
        </AppText>
      </View>
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <Button
          title={t('sa.staffRequestApprove')}
          loading={busy}
          onPress={() => void approve()}
          style={{ flex: 1 }}
        />
        <Button
          variant="secondary"
          title={t('sa.staffRequestReject')}
          disabled={busy}
          onPress={() => setRejecting(true)}
          style={{ flex: 1, backgroundColor: theme.colors.redSoft }}
        />
      </View>

      <BottomSheet
        visible={rejecting}
        onClose={() => setRejecting(false)}
        footer={
          <>
            <Button
              title={t('sa.staffRequestReject')}
              loading={busy}
              disabled={reason.trim().length === 0}
              onPress={() => void reject()}
              style={{ backgroundColor: theme.colors.red }}
            />
            <Button variant="link" title={t('common.cancel')} onPress={() => setRejecting(false)} />
          </>
        }
      >
        <AppText size="title" weight="bold" accessibilityRole="header">
          {t('sa.staffRequestRejectTitle')}
        </AppText>
        <BoxField
          label={t('admin.disputeRejectReason')}
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

function AddStaffSheet({
  visible,
  onClose,
  onAdded,
}: {
  visible: boolean;
  onClose: () => void;
  onAdded: (member: StaffMember) => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const errorText = useErrorText();
  const client = useQueryClient();
  const [phone, setPhone] = useState('');
  const [permissions, setPermissions] = useState<AdminPermission[]>([]);
  const [busy, setBusy] = useState(false);

  const toggle = (permission: AdminPermission) =>
    setPermissions((prev) =>
      prev.includes(permission)
        ? prev.filter((item) => item !== permission)
        : [...prev, permission],
    );

  const submit = async () => {
    setBusy(true);
    try {
      const member = await endpoints.grantStaff({ phone: `+998${phone}`, permissions });
      client.setQueryData(queryKeys.saStaff, (all: StaffMember[] | undefined) => [
        ...(all ?? []),
        member,
      ]);
      showNotice(t('sa.staffAdded'));
      setPhone('');
      setPermissions([]);
      onAdded(member);
      onClose();
    } catch (error) {
      showNotice(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      footer={
        <Button
          title={t('sa.staffAddSend')}
          loading={busy}
          disabled={phone.replace(/\D/g, '').length !== 9}
          onPress={() => void submit()}
        />
      }
    >
      <AppText size="title" weight="bold" accessibilityRole="header">
        {t('sa.staffAddTitle')}
      </AppText>
      <BoxField
        label={t('sa.staffAddPhoneLabel')}
        value={phone}
        onChangeText={(text) => setPhone(text.replace(/\D/g, '').slice(0, 9))}
        keyboardType="number-pad"
        maxLength={9}
        autoFocus
      />
      <View style={{ gap: theme.spacing.sm }}>
        {ADMIN_PERMISSIONS.map((permission) => (
          <View
            key={permission}
            style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}
          >
            <AppText style={{ flex: 1 }}>{t(PERMISSION_LABEL_KEYS[permission])}</AppText>
            <Switch
              value={permissions.includes(permission)}
              onValueChange={() => toggle(permission)}
              accessibilityLabel={t(PERMISSION_LABEL_KEYS[permission])}
              trackColor={{ true: theme.colors.brand, false: theme.colors.border }}
              thumbColor={theme.colors.bg}
            />
          </View>
        ))}
      </View>
    </BottomSheet>
  );
}
