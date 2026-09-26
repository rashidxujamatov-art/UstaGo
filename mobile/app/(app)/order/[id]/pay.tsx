import { Redirect, useLocalSearchParams } from 'expo-router';
import { useOrder } from '../../../../src/api/queries';
import { useErrorText } from '../../../../src/api/use-error-text';
import { OrderPlaceholder } from '../../../../src/orders/OrderParts';
import { awaitsOnlinePayment } from '../../../../src/orders/status';
import { PayOrder } from '../../../../src/payments/PayOrder';

/** BY5 for the customer of a finished online job. */
export default function PayOrderScreen() {
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
  if (order.data.viewer_role !== 'CUSTOMER' || !awaitsOnlinePayment(order.data)) {
    return <Redirect href={{ pathname: '/order/[id]', params: { id } }} />;
  }
  return <PayOrder order={order.data} />;
}
