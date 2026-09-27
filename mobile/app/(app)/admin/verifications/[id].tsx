import { useLocalSearchParams } from 'expo-router';
import { VerificationDetail } from '../../../../src/admin/VerificationDetail';

/** AD1 item: approve or reject a tax verification. */
export default function AdminVerificationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <VerificationDetail id={id} />;
}
