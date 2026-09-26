import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';
import { endpoints } from '../api/endpoints';
import { queryKeys, usePayment } from '../api/queries';
import type { PaymentInfo } from '../api/types';
import { useErrorText } from '../api/use-error-text';
import { showNotice } from '../lib/notice';

/**
 * A Click / Payme payment in progress: opens the provider link, then follows the status
 * (polling plus the `payment.status` event) until it is paid or fails.
 */
export function usePaymentFlow(onPaid: (payment: PaymentInfo) => void) {
  const client = useQueryClient();
  const errorText = useErrorText();
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const payment = usePayment(paymentId);
  const reported = useRef<string | null>(null);

  const status = payment.data?.status;
  useEffect(() => {
    if (payment.data && status === 'PAID' && reported.current !== payment.data.id) {
      reported.current = payment.data.id;
      onPaid(payment.data);
    }
  }, [payment.data, status, onPaid]);

  const open = async (info: PaymentInfo) => {
    if (!info.checkout_url) return;
    try {
      await Linking.openURL(info.checkout_url);
    } catch {
      // No provider app and no browser: the waiting card still offers the link again.
    }
  };

  return {
    payment: payment.data ?? null,
    testing,
    /** Starts following a payment the backend just created. */
    start: async (info: PaymentInfo) => {
      client.setQueryData(queryKeys.payment(info.id), info);
      setPaymentId(info.id);
      if (info.status !== 'PAID') await open(info);
    },
    reopen: () => (payment.data ? open(payment.data) : Promise.resolve()),
    /** PAYMENT_TEST_MODE: finishes the payment without the provider (development). */
    testComplete: async () => {
      if (!paymentId) return;
      setTesting(true);
      try {
        client.setQueryData(
          queryKeys.payment(paymentId),
          await endpoints.testCompletePayment(paymentId),
        );
      } catch (error) {
        showNotice(errorText(error));
      } finally {
        setTesting(false);
      }
    },
    reset: () => setPaymentId(null),
  };
}
