import { useLocalSearchParams } from 'expo-router';
import { useOrder } from '../../../../src/api/queries';
import { useErrorText } from '../../../../src/api/use-error-text';
import { CustomerOrder } from '../../../../src/orders/CustomerOrder';
import { ExecutorJob } from '../../../../src/orders/ExecutorJob';
import { OrderPlaceholder } from '../../../../src/orders/OrderParts';

/** One order: BY3 for its customer, BJ2 and the job steps for executors. */
export default function OrderScreen() {
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

  const props = {
    order: order.data,
    refreshing: order.isRefetching,
    onRefresh: () => void order.refetch(),
  };
  return order.data.viewer_role === 'CUSTOMER' ? (
    <CustomerOrder {...props} />
  ) : (
    <ExecutorJob {...props} />
  );
}
