import { useLocalSearchParams } from 'expo-router';
import { Users, type RoleFilter } from '../../../../src/admin/Users';

/** AD2 "Foydalanuvchilar" (users.manage). `role` optionally pre-selects a tab (from SA3). */
export default function AdminUsersScreen() {
  const { role } = useLocalSearchParams<{ role?: RoleFilter }>();
  return <Users initialRole={role} />;
}
