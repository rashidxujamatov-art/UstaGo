import { useLocalSearchParams } from 'expo-router';
import { useOrder } from '../../../../src/api/queries';
import { useErrorText } from '../../../../src/api/use-error-text';
import { CustomerTrip } from '../../../../src/orders/CustomerTrip';
import { ExecutorTrip } from '../../../../src/orders/ExecutorTrip';
import { OrderPlaceholder } from '../../../../src/orders/OrderParts';

/** BJ12 for the executor, BY7/BY8 for the customer: one order's live trip. */
export default function TripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const errorText = useErrorText();
  const order = useOrder(id);

  if (!order.data) {
    return (
      <OrderPlaceholder
        error={order.isError ? errorText(order.error) : null}
        onRetry={() => void order.refetch()}
      />
    );
  }
  return order.data.viewer_role === 'EXECUTOR' ? (
    <ExecutorTrip order={order.data} />
  ) : (
    <CustomerTrip order={order.data} />
  );
}
