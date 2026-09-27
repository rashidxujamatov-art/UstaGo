import { useLocalSearchParams } from 'expo-router';
import { OrdersModeration } from '../../../../src/admin/OrdersModeration';

/** Orders moderation (orders.moderate). `stuck=1` opens straight into the overdue filter (AD1). */
export default function AdminOrdersScreen() {
  const { stuck } = useLocalSearchParams<{ stuck?: string }>();
  return <OrdersModeration initialStuck={stuck === '1'} />;
}
