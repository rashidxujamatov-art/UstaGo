import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { endpoints } from '../api/endpoints';
import { invalidateOrder, queryKeys } from '../api/queries';
import type { Order } from '../api/types';
import { useErrorText } from '../api/use-error-text';
import { showNotice } from '../lib/notice';

export type PaymentAction = 'paid' | 'received' | 'dispute';

/**
 * The §5.1 confirmations of one order: "To'ladim", "Pulni qabul qildim" and the dispute
 * ("Muammo bor" / "Pul kelmadi"). Each resolves to true when the backend accepted it.
 */
export function usePaymentActions(order: Pick<Order, 'id' | 'viewer_role'> | undefined) {
  const client = useQueryClient();
  const errorText = useErrorText();
  const [busy, setBusy] = useState<PaymentAction | null>(null);

  const run = async (action: PaymentAction, call: () => Promise<Order>) => {
    if (!order) return false;
    setBusy(action);
    try {
      client.setQueryData(queryKeys.order(order.id), await call());
      invalidateOrder(client, order.id);
      return true;
    } catch (error) {
      showNotice(errorText(error));
      invalidateOrder(client, order.id);
      return false;
    } finally {
      setBusy(null);
    }
  };

  return {
    busy,
    paid: () => run('paid', () => endpoints.customerPaid(order?.id ?? '')),
    received: () => run('received', () => endpoints.paymentReceived(order?.id ?? '')),
    dispute: (note?: string) =>
      run('dispute', () =>
        order?.viewer_role === 'EXECUTOR'
          ? endpoints.paymentNotReceived(order.id, note)
          : endpoints.dispute(order?.id ?? '', note),
      ),
  };
}
