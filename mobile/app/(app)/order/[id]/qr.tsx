import { Redirect, useLocalSearchParams } from 'expo-router';
import { useOrder } from '../../../../src/api/queries';
import { useErrorText } from '../../../../src/api/use-error-text';
import { OrderPlaceholder } from '../../../../src/orders/OrderParts';
import { hasPaymentQr } from '../../../../src/orders/status';
import { OrderQr } from '../../../../src/payments/OrderQr';

/** BJ4 for the executor of a finished Click / Payme job. */
export default function OrderQrScreen() {
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
  if (data.viewer_role !== 'EXECUTOR' || (!hasPaymentQr(data) && data.status !== 'PAID')) {
    return <Redirect href={{ pathname: '/order/[id]', params: { id } }} />;
  }
  return <OrderQr order={data} />;
}
