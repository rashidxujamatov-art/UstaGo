import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ArrowRight, Check, CreditCard, Plus, QrCode, Wallet } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { endpoints } from '../api/endpoints';
import { invalidateOrder, queryKeys, useCards, useWallet } from '../api/queries';
import type { Order } from '../api/types';
import { useErrorText } from '../api/use-error-text';
import { AppText } from '../components/AppText';
import { BarHeader } from '../components/ui/BarHeader';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { appBranding } from '../lib/app-config';
import { leave } from '../lib/navigation';
import { showNotice } from '../lib/notice';
import { Footer } from '../orders/OrderParts';
import { useOrderTexts } from '../orders/texts';
import { useTheme } from '../theme/ThemeProvider';
import { MethodList, MethodRow, PaymentWaiting, SecureNote } from './PaymentParts';
import { usePaymentFlow } from './use-payment-flow';

const { appName } = appBranding();

/**
 * BY5: the customer pays a finished job with the method chosen when it was posted
 * (decision of 2026-09-26): from the balance, by a saved card, or through Click / Payme.
 */
export function PayOrder({ order }: { order: Order }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const texts = useOrderTexts();
  const errorText = useErrorText();
  const client = useQueryClient();
  const wallet = useWallet();
  const cards = useCards();
  const [cardId, setCardId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const done = useCallback(() => {
    invalidateOrder(client, order.id);
    leave({ pathname: '/order/[id]', params: { id: order.id } });
  }, [client, order.id]);
  const flow = usePaymentFlow(done);

  const method = order.payment_method;
  const price = BigInt(order.price);
  const balance = wallet.data ? BigInt(wallet.data.real) : null;
  const shortfall = balance !== null && balance < price ? price - balance : 0n;
  const chosenCard = cardId ?? cards.data?.[0]?.id ?? null;
  const provider = method === 'CLICK' ? 'Click' : method === 'PAYME' ? 'Payme' : '';

  const pay = async () => {
    setBusy(true);
    try {
      const result = await endpoints.payOrder(
        order.id,
        method === 'CARD' ? (chosenCard ?? undefined) : undefined,
      );
      if (result.order) client.setQueryData(queryKeys.order(order.id), result.order);
      if (result.payment && result.payment.status !== 'PAID') {
        await flow.start(result.payment);
      } else {
        done();
      }
    } catch (error) {
      showNotice(errorText(error));
      invalidateOrder(client, order.id);
    } finally {
      setBusy(false);
    }
  };

  const footer = () => {
    if (method === 'BALANCE') {
      return shortfall > 0n ? (
        <Button
          icon={Plus}
          title={t('pay.topUp')}
          onPress={() =>
            router.push({ pathname: '/wallet/topup', params: { amount: shortfall.toString() } })
          }
        />
      ) : (
        <Button
          icon={ArrowRight}
          title={t('pay.payBalance', { amount: texts.money(price) })}
          loading={busy}
          disabled={balance === null}
          onPress={() => void pay()}
        />
      );
    }
    if (method === 'CARD') {
      return chosenCard ? (
        <Button
          icon={CreditCard}
          title={t('pay.payCard', { amount: texts.money(price) })}
          loading={busy}
          onPress={() => void pay()}
        />
      ) : (
        <Button icon={Plus} title={t('pay.addCard')} onPress={() => router.push('/cards/new')} />
      );
    }
    return (
      <Button
        icon={QrCode}
        title={t('pay.payWith', { provider })}
        loading={busy}
        onPress={() => void pay()}
      />
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg2 }}>
      <BarHeader title={t('pay.title')} subtitle={t('pay.subtitle', { number: order.number })} />
      <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}>
        <Card style={{ alignItems: 'center' }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.sm,
              paddingHorizontal: theme.spacing.lg,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: theme.colors.greenSoft,
            }}
          >
            <Check size={18} color={theme.colors.green} />
            <AppText weight="bold" color="green">
              {t('pay.doneChip')}
            </AppText>
          </View>
          <AppText size="bodyLarge" color="text2" style={{ textAlign: 'center' }}>
            {order.title}
          </AppText>
          <AppText>
            <AppText size="amountLarge" weight="bold">
              {texts.amount(order.price)}
            </AppText>
            <AppText size="title" weight="semibold">{` ${t('common.currency')}`}</AppText>
          </AppText>
          <AppText color="text2">
            {t('pay.proLine', {
              name: order.executor
                ? `${order.executor.first_name} ${order.executor.last_name}`.trim()
                : '',
              when: order.timeline.finished_at ? texts.startsAt(order.timeline.finished_at) : '',
            })}
          </AppText>
        </Card>

        {flow.payment ? (
          <PaymentWaiting
            payment={flow.payment}
            providerName={provider}
            testing={flow.testing}
            onReopen={() => void flow.reopen()}
            onTestComplete={() => void flow.testComplete()}
          />
        ) : (
          <>
            <AppText size="bodyLarge" weight="bold" color="brandText">
              {t('pay.methodTitle')}
            </AppText>
            <MethodList>
              {method === 'BALANCE' ? (
                <MethodRow
                  icon={Wallet}
                  color="brand"
                  title={t('pay.balance', { appName })}
                  subtitle={
                    balance === null
                      ? undefined
                      : shortfall > 0n
                        ? t('pay.balanceShort', {
                            balance: texts.money(balance),
                            shortfall: texts.money(shortfall),
                          })
                        : t('pay.balanceSub', {
                            balance: texts.money(balance),
                            after: texts.money(balance - price),
                          })
                  }
                  selected
                  onPress={() => undefined}
                  last
                />
              ) : method === 'CARD' ? (
                <>
                  {(cards.data ?? []).map((card) => (
                    <MethodRow
                      key={card.id}
                      icon={CreditCard}
                      color="orange"
                      title={t('pay.card')}
                      subtitle={t('pay.cardSub', {
                        brand: t(`cards.brands.${card.brand}`),
                        last4: card.last4,
                      })}
                      selected={card.id === chosenCard}
                      onPress={() => setCardId(card.id)}
                    />
                  ))}
                  <MethodRow
                    icon={Plus}
                    color="text2"
                    title={t('pay.addCard')}
                    selected={false}
                    onPress={() => router.push('/cards/new')}
                    last
                  />
                </>
              ) : (
                <MethodRow
                  icon={QrCode}
                  color={method === 'CLICK' ? 'brand' : 'green'}
                  title={`${provider} QR`}
                  subtitle={t(method === 'CLICK' ? 'pay.clickSub' : 'pay.paymeSub')}
                  selected
                  onPress={() => undefined}
                  last
                />
              )}
            </MethodList>
            <SecureNote>{t('pay.note', { appName })}</SecureNote>
          </>
        )}
      </ScrollView>
      {flow.payment ? null : (
        <Footer>
          <View style={{ paddingBottom: insets.bottom }}>{footer()}</View>
        </Footer>
      )}
    </View>
  );
}
