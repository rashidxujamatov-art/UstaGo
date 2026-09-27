import { useLocalSearchParams } from 'expo-router';
import { DisputeDetail } from '../../../../src/admin/DisputeDetail';

/** AD3 detail: decision, and (super admin) approve / reject. */
export default function AdminDisputeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <DisputeDetail orderId={id} />;
}
