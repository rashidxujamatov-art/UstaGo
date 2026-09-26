import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Check, CreditCard, Plus, QrCode } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { endpoints } from '../../../src/api/endpoints';
import { queryKeys, useCards, useConfig, useWallet } from '../../../src/api/queries';
import { useErrorText } from '../../../src/api/use-error-text';
import { AppText } from '../../../src/components/AppText';
import { BarHeader } from '../../../src/components/ui/BarHeader';
import { Button } from '../../../src/components/ui/Button';
import { Card } from '../../../src/components/ui/Card';
import { Chip } from '../../../src/components/ui/Chip';
import { leave } from '../../../src/lib/navigation';
import { showNotice } from '../../../src/lib/notice';
import { MoneyLine } from '../../../src/orders/ConfirmParts';
import { Footer } from '../../../src/orders/OrderParts';
import { useOrderTexts } from '../../../src/orders/texts';
import {
  AmountInput,
  MethodList,
  MethodRow,
  PaymentWaiting,
  SecureNote,
} from '../../../src/payments/PaymentParts';
import { usePaymentFlow } from '../../../src/payments/use-payment-flow';
import { useTheme } from '../../../src/theme/ThemeProvider';

type Method = { kind: 'CLICK' | 'PAYME' } | { kind: 'CARD'; cardId: string };

const CHIPS_SOM = [50_000n, 100_000n, 200_000n];

/**
 * BJ6 "Hisobni to‘ldirish": Click, Payme or a saved card (docs/01 §7, topup_min, no fee).
 * From BJ3 it opens with the missing `amount` and the job it is needed for.
 */
export default function TopupScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const texts = useOrderTexts();
  const errorText = useErrorText();
  const client = useQueryClient();
  const params = useLocalSearchParams<{ amount?: string; order?: string; required?: string }>();
  const wallet = useWallet();
  const cards = useCards();
  const config = useConfig();

  const suggested =
    params.amount && /^\d+00$/.test(params.amount) ? params.amount.slice(0, -2) : '';
  const [digits, setDigits] = useState(suggested || '50000');
  const [method, setMethod] = useState<Method>({ kind: 'CLICK' });
  const [busy, setBusy] = useState(false);

  const finished = useCallback(() => {
    void client.invalidateQueries({ queryKey: queryKeys.wallet });
    void client.invalidateQueries({ queryKey: queryKeys.walletTransactions });
    showNotice(t('topup.done'));
    leave('/wallet');
  }, [client, t]);
  const flow = usePaymentFlow(finished);

  const amount = digits ? BigInt(`${digits}00`) : 0n;
  const available = wallet.data ? BigInt(wallet.data.available) : null;
  const required =
    params.required && /^\d+$/.test(params.required) ? BigInt(params.required) : null;
  const enabled = config.data?.payment_methods_enabled ?? [];
  const chips = [...(suggested ? [BigInt(suggested)] : []), ...CHIPS_SOM].filter(
    (value, index, list) => list.indexOf(value) === index,
  );
  const providerName = method.kind === 'CLICK' ? 'Click' : method.kind === 'PAYME' ? 'Payme' : '';

  const submit = async () => {
    setBusy(true);
    try {
      const payment = await endpoints.topup({
        amount: amount.toString(),
        method: method.kind,
        card_id: method.kind === 'CARD' ? method.cardId : undefined,
      });
      if (payment.status === 'PAID') finished();
      else await flow.start(payment);
    } catch (error) {
      showNotice(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg2 }}>
      <BarHeader title={t('topup.title')} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}
        >
          {flow.payment ? (
            <PaymentWaiting
              payment={flow.payment}
              providerName={providerName}
              hint={t('topup.waitingHint', { provider: providerName })}
              testing={flow.testing}
              onReopen={() => void flow.reopen()}
              onTestComplete={() => void flow.testComplete()}
            />
          ) : (
            <>
              <Card>
                <AmountInput label={t('topup.amount')} digits={digits} onChange={setDigits} />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                  {chips.map((chip) => (
                    <Chip
                      key={chip.toString()}
                      label={texts.amount(chip * 100n)}
                      selected={digits === chip.toString()}
                      onPress={() => setDigits(chip.toString())}
                    />
                  ))}
                </View>
                {available !== null ? (
                  <View
                    style={{
                      padding: theme.spacing.lg,
                      gap: theme.spacing.xs,
                      borderRadius: theme.radius.card,
                      backgroundColor: theme.colors.surface2,
                    }}
                  >
                    <MoneyLine label={t('topup.current')} value={texts.money(available)} />
                    <MoneyLine
                      label={t('topup.after')}
                      value={texts.money(available + amount)}
                      color="green"
                    />
                    {params.order && required !== null && available + amount >= required ? (
                      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                        <Check size={20} color={theme.colors.green} />
                        <AppText weight="semibold" color="green" style={{ flex: 1 }}>
                          {t('topup.enoughFor', { number: params.order })}
                        </AppText>
                      </View>
                    ) : null}
                  </View>
                ) : null}
                {config.data ? (
                  <AppText color="text2">
                    {t('topup.min', { min: texts.money(config.data.topup_min) })}
                  </AppText>
                ) : null}
              </Card>

              <AppText size="bodyLarge" weight="bold" color="brandText">
                {t('topup.method')}
              </AppText>
              <MethodList>
                {enabled.includes('CLICK') ? (
                  <MethodRow
                    icon={QrCode}
                    color="brand"
                    title="Click"
                    subtitle={t('topup.appOrQr')}
                    selected={method.kind === 'CLICK'}
                    onPress={() => setMethod({ kind: 'CLICK' })}
                  />
                ) : null}
                {enabled.includes('PAYME') ? (
                  <MethodRow
                    icon={QrCode}
                    color="green"
                    title="Payme"
                    subtitle={t('topup.appOrQr')}
                    selected={method.kind === 'PAYME'}
                    onPress={() => setMethod({ kind: 'PAYME' })}
                  />
                ) : null}
                {enabled.includes('CARD')
                  ? (cards.data ?? []).map((card) => (
                      <MethodRow
                        key={card.id}
                        icon={CreditCard}
                        color={
                          card.brand === 'VISA' || card.brand === 'MASTERCARD' ? 'red' : 'orange'
                        }
                        title={
                          card.brand === 'VISA' || card.brand === 'MASTERCARD'
                            ? t('topup.foreignCard')
                            : t('topup.localCard')
                        }
                        subtitle={`•••• ${card.last4}`}
                        selected={method.kind === 'CARD' && method.cardId === card.id}
                        onPress={() => setMethod({ kind: 'CARD', cardId: card.id })}
                      />
                    ))
                  : null}
                {enabled.includes('CARD') ? (
                  <MethodRow
                    icon={Plus}
                    color="text2"
                    title={t('pay.addCard')}
                    subtitle={`${t('topup.localCard')} · ${t('topup.foreignCard')}`}
                    selected={false}
                    onPress={() => router.push('/cards/new')}
                    last
                  />
                ) : null}
              </MethodList>
              <SecureNote>{t('topup.secure')}</SecureNote>
            </>
          )}
        </ScrollView>
        {flow.payment ? null : (
          <Footer>
            <View style={{ paddingBottom: insets.bottom }}>
              <Button
                title={t('topup.submit', { amount: texts.money(amount) })}
                loading={busy}
                disabled={amount === 0n}
                onPress={() => void submit()}
              />
            </View>
          </Footer>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}
