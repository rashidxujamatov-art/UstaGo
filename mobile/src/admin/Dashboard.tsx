import { router } from 'expo-router';
import {
  ClipboardList,
  Flag,
  Lock,
  MessageCircle,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { endpoints } from '../api/endpoints';
import { queryKeys, useAdminDashboard } from '../api/queries';
import type { AdminPermission } from '../api/types';
import { useErrorText } from '../api/use-error-text';
import { useQueryClient } from '@tanstack/react-query';
import { AppText } from '../components/AppText';
import { Avatar } from '../components/ui/Avatar';
import { BarHeader } from '../components/ui/BarHeader';
import { BottomSheet } from '../components/ui/BottomSheet';
import { Button } from '../components/ui/Button';
import { BoxField } from '../components/ui/BoxField';
import { Card } from '../components/ui/Card';
import { Tag } from '../components/ui/Chip';
import { initials } from '../lib/input';
import { showNotice } from '../lib/notice';
import { useOrderTexts } from '../orders/texts';
import {
  ADMIN_PERMISSIONS,
  isSuperAdmin,
  PERMISSION_DESC_KEYS,
  PERMISSION_LABEL_KEYS,
} from './permissions';
import { useSession } from '../store/session';
import { useTheme } from '../theme/ThemeProvider';

/** Where each permission chip navigates once granted (tapping a locked one asks for it instead). */
const PERMISSION_ROUTE: Record<AdminPermission, string> = {
  'orders.moderate': '/admin/orders',
  'users.manage': '/admin/users',
  'disputes.resolve': '/admin/disputes',
  'categories.manage': '/admin/categories',
  'finance.view': '/admin/sa/finance',
  'notifications.broadcast': '/admin/broadcast',
};

/** AD1 "Admin paneli": sections the caller has permission for, degrading instead of 403ing. */
export function Dashboard() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const errorText = useErrorText();
  const texts = useOrderTexts();
  const client = useQueryClient();
  const user = useSession((state) => state.user);
  const dashboard = useAdminDashboard();
  const [requesting, setRequesting] = useState(false);

  if (!user?.staff) return null;
  const superAdmin = isSuperAdmin(user);

  if (!dashboard.data) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg2 }}>
        <BarHeader title={t('admin.dashboardTitle')} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {dashboard.isError ? (
            <View style={{ gap: theme.spacing.md, padding: theme.spacing.xl }}>
              <AppText style={{ textAlign: 'center' }}>{errorText(dashboard.error)}</AppText>
              <Button
                variant="secondary"
                title={t('common.retry')}
                onPress={() => void dashboard.refetch()}
              />
            </View>
          ) : (
            <ActivityIndicator color={theme.colors.brand} />
          )}
        </View>
      </View>
    );
  }
  const data = dashboard.data;
  const granted = new Set(superAdmin ? ADMIN_PERMISSIONS : data.permissions);
  const name = user.identity
    ? `${user.identity.first_name} ${user.identity.last_name}`
    : user.phone;
  const requestable = ADMIN_PERMISSIONS.filter(
    (permission) =>
      !granted.has(permission) &&
      !data.my_permission_requests.some(
        (request) => request.permission === permission && request.status === 'PENDING',
      ),
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg2 }}>
      <BarHeader
        title={t('admin.dashboardTitle')}
        right={
          <Tag label={t(superAdmin ? 'admin.roleSuperAdmin' : 'admin.roleAdmin')} tone="neutral" />
        }
      />
      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing.lg,
          gap: theme.spacing.lg,
          paddingBottom: insets.bottom + theme.spacing.xl,
        }}
        refreshControl={
          <RefreshControl
            refreshing={dashboard.isRefetching}
            onRefresh={() => void dashboard.refetch()}
            tintColor={theme.colors.brand}
          />
        }
      >
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
            <Avatar initials={initials(user.identity?.first_name, user.identity?.last_name)} />
            <View style={{ flex: 1 }}>
              <AppText size="bodyLarge" weight="bold">
                {name}
              </AppText>
              <AppText color="text2">
                {t(superAdmin ? 'admin.roleSuperAdmin' : 'admin.roleAdmin')}
              </AppText>
            </View>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {ADMIN_PERMISSIONS.map((permission) => (
              <Pressable
                key={permission}
                accessibilityRole="button"
                onPress={() =>
                  granted.has(permission)
                    ? router.push(PERMISSION_ROUTE[permission])
                    : setRequesting(true)
                }
              >
                <Tag
                  label={t(PERMISSION_LABEL_KEYS[permission])}
                  tone={granted.has(permission) ? 'green' : 'neutral'}
                  icon={granted.has(permission) ? undefined : Lock}
                />
              </Pressable>
            ))}
          </View>
        </Card>

        <View style={{ gap: theme.spacing.sm }}>
          <AppText size="title" weight="bold" color="brandText">
            {t('admin.tasksTitle')}
          </AppText>
          <Card style={{ gap: 0 }}>
            <TaskRow
              icon={ShieldCheck}
              iconTone="brand"
              title={t('admin.taskVerifications')}
              subtitle={t('admin.taskVerificationsSub')}
              count={data.tasks.verifications_pending}
              onPress={() => router.push('/admin/verifications')}
            />
            <TaskRow
              icon={Flag}
              iconTone="red"
              title={t('admin.taskDisputes')}
              subtitle={t('admin.taskDisputesSub')}
              count={data.tasks.disputes_open}
              onPress={() => router.push('/admin/disputes')}
            />
            <TaskRow
              icon={ClipboardList}
              iconTone="orange"
              title={t('admin.taskOrders')}
              subtitle={t('admin.taskOrdersSub')}
              count={data.tasks.orders_stuck}
              onPress={() => router.push({ pathname: '/admin/orders', params: { stuck: '1' } })}
            />
            <TaskRow
              icon={MessageCircle}
              iconTone="brandText"
              title={t('admin.taskSupport')}
              subtitle={t('admin.taskSupportSub')}
              count={null}
              soon
              last
            />
          </Card>
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <AppText size="title" weight="bold" color="brandText">
            {t('admin.statsToday')}
          </AppText>
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <StatBox value={String(data.stats.orders_today)} label={t('admin.statOrders')} />
            <StatBox value={String(data.stats.new_users_today)} label={t('admin.statUsers')} />
            <StatBox
              value={data.stats.revenue_today ? texts.amount(data.stats.revenue_today) : '—'}
              label={t('admin.statRevenue')}
            />
          </View>
        </View>

        {requestable.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setRequesting(true)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.md,
              padding: theme.spacing.lg,
              borderRadius: theme.radius.card,
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: theme.colors.border,
              backgroundColor: pressed ? theme.colors.surface2 : theme.colors.surface,
            })}
          >
            <Lock size={22} color={theme.colors.text2} />
            <AppText weight="bold" style={{ flex: 1 }}>
              {t('admin.noPermissionsGranted')}
            </AppText>
            <Tag label={t('admin.requestPermission')} tone="brand" />
          </Pressable>
        ) : null}
      </ScrollView>

      <RequestPermissionSheet
        visible={requesting}
        permissions={requestable}
        onClose={() => setRequesting(false)}
        onSent={() => {
          setRequesting(false);
          void client.invalidateQueries({ queryKey: queryKeys.adminDashboard });
        }}
      />
    </View>
  );
}

function StatBox({ value, label }: { value: string; label: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flex: 1,
        padding: theme.spacing.lg,
        gap: 2,
        borderRadius: theme.radius.card,
        backgroundColor: theme.colors.surface,
      }}
    >
      <AppText size="title" weight="bold">
        {value}
      </AppText>
      <AppText color="text2">{label}</AppText>
    </View>
  );
}

function TaskRow({
  icon: Icon,
  iconTone,
  title,
  subtitle,
  count,
  soon = false,
  last = false,
  onPress,
}: {
  icon: LucideIcon;
  iconTone: 'brand' | 'red' | 'orange' | 'brandText';
  title: string;
  subtitle: string;
  count: number | null;
  soon?: boolean;
  last?: boolean;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const toneColor =
    iconTone === 'brand'
      ? theme.colors.brand
      : iconTone === 'red'
        ? theme.colors.red
        : iconTone === 'orange'
          ? theme.colors.orange
          : theme.colors.brandText;
  const disabled = soon || count === null || !onPress;

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingVertical: theme.spacing.md,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: theme.colors.sep,
        backgroundColor: pressed && !disabled ? theme.colors.surface2 : 'transparent',
        opacity: soon ? 0.6 : 1,
      })}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: theme.radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: `${toneColor}22`,
        }}
      >
        <Icon size={22} color={toneColor} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText size="bodyLarge" weight="bold">
          {title}
        </AppText>
        <AppText color="text2">{subtitle}</AppText>
      </View>
      {soon ? (
        <Tag label={t('admin.taskSupportSub')} tone="neutral" />
      ) : count === null ? (
        <Lock size={18} color={theme.colors.text2} />
      ) : (
        <View
          style={{
            minWidth: 28,
            height: 28,
            paddingHorizontal: 8,
            borderRadius: 14,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: count > 0 ? theme.colors.brand : theme.colors.surface2,
          }}
        >
          <AppText weight="bold" style={{ color: count > 0 ? theme.colors.barText : undefined }}>
            {count}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

function RequestPermissionSheet({
  visible,
  permissions,
  onClose,
  onSent,
}: {
  visible: boolean;
  permissions: AdminPermission[];
  onClose: () => void;
  onSent: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const errorText = useErrorText();
  const [selected, setSelected] = useState<AdminPermission | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  const permission = selected ?? permissions[0] ?? null;

  const send = async () => {
    if (!permission) return;
    setSending(true);
    try {
      await endpoints.requestPermission({ permission, note: note.trim() || undefined });
      setNote('');
      setSelected(null);
      onSent();
    } catch (error) {
      showNotice(errorText(error));
    } finally {
      setSending(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      footer={
        <>
          <Button
            title={t('admin.requestPermissionSend')}
            loading={sending}
            disabled={!permission}
            onPress={() => void send()}
          />
          <Button variant="link" title={t('common.cancel')} onPress={onClose} />
        </>
      }
    >
      <AppText size="title" weight="bold" accessibilityRole="header">
        {t('admin.requestPermissionTitle')}
      </AppText>
      <View style={{ gap: theme.spacing.sm }}>
        {permissions.map((item) => (
          <Pressable
            key={item}
            accessibilityRole="radio"
            accessibilityState={{ selected: permission === item }}
            onPress={() => setSelected(item)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.md,
              padding: theme.spacing.md,
              borderRadius: theme.radius.lg,
              borderWidth: 1,
              borderColor: permission === item ? theme.colors.brand : theme.colors.sep,
            }}
          >
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                borderWidth: 2,
                borderColor: permission === item ? theme.colors.brand : theme.colors.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {permission === item ? (
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
            <View style={{ flex: 1 }}>
              <AppText weight="bold">{t(PERMISSION_LABEL_KEYS[item])}</AppText>
              <AppText color="text2">{t(PERMISSION_DESC_KEYS[item])}</AppText>
            </View>
          </Pressable>
        ))}
      </View>
      <BoxField
        label={t('admin.requestPermissionNote')}
        value={note}
        onChangeText={setNote}
        maxLength={300}
        multiline
      />
    </BottomSheet>
  );
}
