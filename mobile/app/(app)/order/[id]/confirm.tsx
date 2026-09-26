import { Redirect, useLocalSearchParams } from 'expo-router';
import { useOrder } from '../../../../src/api/queries';
import { useErrorText } from '../../../../src/api/use-error-text';
import { OrderPlaceholder } from '../../../../src/orders/OrderParts';
import { PayConfirm } from '../../../../src/orders/PayConfirm';
import { ReceiveConfirm } from '../../../../src/orders/ReceiveConfirm';
import { awaitsCustomerPaid, awaitsExecutorReceived } from '../../../../src/orders/status';

/** BY9 for the customer, BJ13 for the executor of a cash / Xolis job (§5.1). */
export default function ConfirmPaymentScreen() {
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
  const data = order.data;
  if (data.viewer_role === 'CUSTOMER' && awaitsCustomerPaid(data)) {
    return <PayConfirm order={data} />;
  }
  if (data.viewer_role === 'EXECUTOR' && awaitsExecutorReceived(data)) {
    return <ReceiveConfirm order={data} />;
  }
  // Already confirmed (or not a cash job): back to the order itself.
  return <Redirect href={{ pathname: '/order/[id]', params: { id } }} />;
}
