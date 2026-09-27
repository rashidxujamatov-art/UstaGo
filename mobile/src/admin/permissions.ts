import type { AdminPermission, Me } from '../api/types';

/** The six grantable permissions, in the order AD1/SA3 display them. */
export const ADMIN_PERMISSIONS: readonly AdminPermission[] = [
  'orders.moderate',
  'users.manage',
  'disputes.resolve',
  'categories.manage',
  'finance.view',
  'notifications.broadcast',
];

/**
 * i18n keys for each permission, as literal const maps (not computed strings): i18next's `t()`
 * is typed against the exact translation-key union (`i18next.d.ts`), so a plain `string` built
 * with a template literal at runtime would fail to type-check — dots in the permission string
 * also rule out a `t(\`admin.permissionLabel.${permission}\`)` nested path.
 */
export const PERMISSION_LABEL_KEYS = {
  'orders.moderate': 'admin.permOrdersModerateLabel',
  'users.manage': 'admin.permUsersManageLabel',
  'disputes.resolve': 'admin.permDisputesResolveLabel',
  'categories.manage': 'admin.permCategoriesManageLabel',
  'finance.view': 'admin.permFinanceViewLabel',
  'notifications.broadcast': 'admin.permNotificationsBroadcastLabel',
} as const satisfies Record<AdminPermission, string>;

export const PERMISSION_DESC_KEYS = {
  'orders.moderate': 'admin.permOrdersModerateDesc',
  'users.manage': 'admin.permUsersManageDesc',
  'disputes.resolve': 'admin.permDisputesResolveDesc',
  'categories.manage': 'admin.permCategoriesManageDesc',
  'finance.view': 'admin.permFinanceViewDesc',
  'notifications.broadcast': 'admin.permNotificationsBroadcastDesc',
} as const satisfies Record<AdminPermission, string>;

/** Whether the signed-in staff member (admin or super admin) holds this permission. */
export function hasPermission(me: Pick<Me, 'staff'>, permission: AdminPermission): boolean {
  const staff = me.staff;
  if (!staff) return false;
  return staff.role === 'SUPER_ADMIN' || staff.permissions.includes(permission);
}

/** Any staff row (admin or super admin) — the `'STAFF'` guard (stage7-contract §0). */
export function isStaff(me: Pick<Me, 'staff'>): boolean {
  return me.staff !== null;
}

export function isSuperAdmin(me: Pick<Me, 'staff'>): boolean {
  return me.staff?.role === 'SUPER_ADMIN';
}
