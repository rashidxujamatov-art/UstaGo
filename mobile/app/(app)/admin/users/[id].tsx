import { useLocalSearchParams } from 'expo-router';
import { UserDetail } from '../../../../src/admin/UserDetail';

/** AD2 detail: block / unblock with a reason. */
export default function AdminUserDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <UserDetail id={id} />;
}
