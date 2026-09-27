import { useLocalSearchParams } from 'expo-router';
import { OrderModerationDetail } from '../../../../src/admin/OrderModerationDetail';

/** Orders moderation detail: full view, timeline, admin cancel. */
export default function AdminOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <OrderModerationDetail id={id} />;
}
