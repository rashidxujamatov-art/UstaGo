import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, RefreshCw } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { endpoints } from '../api/endpoints';
import { invalidateOrder, queryKeys, usePayment } from '../api/queries';
import type { Order, PaymentInfo } from '../api/types';
import { useErrorText } from '../api/use-error-text';
import { AppText } from '../components/AppText';
import { BarHeader } from '../components/ui/BarHeader';
import { Button } from '../components/ui/Button';
import { Card, Separator } from '../components/ui/Card';
import { leave } from '../lib/navigation';
import { formatPercent } from '../lib/format';
import { formatCountdown } from '../lib/input';
import { showNotice } from '../lib/notice';
import { MoneyLine } from '../orders/ConfirmParts';
import { useOrderTexts } from '../orders/texts';
import { useTheme } from '../theme/ThemeProvider';

/**
 * BJ4: the executor shows the order's Click / Payme QR; the customer scans it with the
 * provider app. The QR lives qr_payment_ttl_sec; the screen closes when the payment lands.
 */
export function OrderQr({ order }: { order: Order }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const texts = useOrderTexts();
  const errorText = useErrorText();
  const client = useQueryClient();
  // Each round shows a fresh QR; "Yangi QR kod" starts the next round.
  const [round, setRound] = useState(0);
  const [testing, setTesting] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const session = useQuery({
    queryKey: ['payment-session', order.id, round],
    queryFn: () => endpoints.paymentSession(order.id),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const payment = usePayment(session.data?.id ?? null);
  const current: PaymentInfo | null = payment.data ?? session.data ?? null;
  const provider = order.payment_method === 'CLICK' ? 'Click' : 'Payme';
  const create = () => setRound((value) => value + 1);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  const paid = current?.status === 'PAID' || order.status === 'PAID';
  useEffect(() => {
    if (!paid) return undefined;
    invalidateOrder(client, order.id);
    const timer = setTimeout(
      () => leave({ pathname: '/order/[id]', params: { id: order.id } }),
      1_500,
    );
    return () => clearTimeout(timer);
  }, [paid, client, order.id]);

  const left = current ? Math.max(0, (new Date(current.expires_at).getTime() - now) / 1000) : 0;
  const expired =
    current !== null &&
    (current.status === 'EXPIRED' || (current.status === 'CREATED' && left <= 0));
  const fee = order.fee;

  const testComplete = async () => {
    if (!current) return;
    setTesting(true);
    try {
      client.setQueryData(
        queryKeys.payment(current.id),
        await endpoints.testCompletePayment(current.id),
      );
    } catch (error) {
      showNotice(errorText(error));
    } finally {
      setTesting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg2 }}>
      <BarHeader
        title={t('qr.title')}
        subtitle={t('qr.subtitle', {
          number: order.number,
          name: texts.customerName(order.customer),
        })}
      />
      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing.lg,
          gap: theme.spacing.lg,
          paddingBottom: insets.bottom + theme.spacing.xl,
        }}
      >
        <Card style={{ alignItems: 'center' }}>
          <AppText weight="semibold" color="brandText">
            {`${provider} QR`}
          </AppText>
          <AppText color="text2">{t('qr.amountLabel')}</AppText>
          <AppText>
            <AppText size="amountLarge" weight="bold">
              {texts.amount(order.price)}
            </AppText>
            <AppText size="title" weight="semibold">{` ${t('common.currency')}`}</AppText>
          </AppText>

          {paid ? (
            <View
              style={{ alignItems: 'center', gap: theme.spacing.sm, padding: theme.spacing.xl }}
            >
              <Check size={48} color={theme.colors.green} />
              <AppText size="title" weight="bold" color="green">
                {t('qr.paid')}
              </AppText>
            </View>
          ) : session.isError ? (
            <AppText color="red" style={{ textAlign: 'center', padding: theme.spacing.lg }}>
              {errorText(session.error)}
            </AppText>
          ) : !current ? (
            <ActivityIndicator color={theme.colors.brand} style={{ margin: theme.spacing.xl }} />
          ) : current.checkout_url && !expired ? (
            <View
              style={{
                padding: theme.spacing.lg,
                borderRadius: theme.radius.card,
                borderWidth: 1,
                borderColor: theme.colors.sep,
                backgroundColor: theme.colors.qrBg,
              }}
            >
              <QRCode value={current.checkout_url} size={200} />
            </View>
          ) : expired ? (
            <View
              style={{ alignItems: 'center', gap: theme.spacing.md, padding: theme.spacing.lg }}
            >
              <AppText size="bodyLarge" weight="semibold" color="red">
                {t('qr.expired')}
              </AppText>
              <Button
                variant="secondary"
                icon={RefreshCw}
                title={t('qr.refresh')}
                onPress={create}
              />
            </View>
          ) : (
            <AppText color="text2" style={{ textAlign: 'center', padding: theme.spacing.lg }}>
              {t('qr.notConfigured')}
            </AppText>
          )}

          {!paid && current && !expired ? (
            <>
              <AppText size="bodyLarge" color="text2" style={{ textAlign: 'center' }}>
                {t('qr.scanHint', { provider })}
              </AppText>
              <AppText size="bodyLarge" weight="bold" color="brandText">
                {t('qr.waiting', { time: formatCountdown(left) })}
              </AppText>
              {current.test_mode ? (
                <Button
                  variant="link"
                  title={t('pay.testComplete')}
                  loading={testing}
                  onPress={() => void testComplete()}
                />
              ) : null}
            </>
          ) : null}
        </Card>

        <Card>
          <MoneyLine label={t('qr.orderPrice')} value={texts.money(order.price)} />
          {fee ? (
            <MoneyLine
              label={t('qr.fee', { percent: fee.fee_bps ? formatPercent(fee.fee_bps) : '' })}
              value={
                BigInt(fee.fee_real) === 0n
                  ? t('qr.feeDemo', { amount: texts.amount(fee.fee) })
                  : texts.money(-BigInt(fee.fee))
              }
              color={BigInt(fee.fee_real) === 0n ? 'orange' : 'red'}
            />
          ) : null}
          <Separator />
          <MoneyLine
            label={t('qr.toAccount')}
            value={texts.money(order.price)}
            color="green"
            strong
          />
        </Card>
      </ScrollView>
    </View>
  );
}
