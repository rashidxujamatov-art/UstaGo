import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ChevronRight, CreditCard, Info, Plus, TriangleAlert } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { endpoints } from '../../../src/api/endpoints';
import { queryKeys, useCards, useWithdrawPreview } from '../../../src/api/queries';
import { useErrorText } from '../../../src/api/use-error-text';
import { AppText } from '../../../src/components/AppText';
import { BarHeader } from '../../../src/components/ui/BarHeader';
import { BottomSheet } from '../../../src/components/ui/BottomSheet';
import { Button } from '../../../src/components/ui/Button';
import { Card, Separator } from '../../../src/components/ui/Card';
import { formatPercent } from '../../../src/lib/format';
import { leave } from '../../../src/lib/navigation';
import { showNotice } from '../../../src/lib/notice';
import { Footer } from '../../../src/orders/OrderParts';
import { useOrderTexts } from '../../../src/orders/texts';
import { AmountInput, MethodList, MethodRow } from '../../../src/payments/PaymentParts';
import { useTheme } from '../../../src/theme/ThemeProvider';

/** A key per screen visit: a repeated tap never withdraws twice (CLAUDE.md rule 3). */
const newKey = () => `wd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * BJ7 "Pul yechish" (docs/01-biznes-qoidalar.md §7): the fees reserved for active jobs
 * stay, the bank takes 1% (not the platform), the money goes to a saved card.
 */
export default function WithdrawScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const texts = useOrderTexts();
  const errorText = useErrorText();
  const client = useQueryClient();
  const cards = useCards();
  // Null until the user types: the field then shows the largest amount allowed.
  const [typed, setTyped] = useState<string | null>(null);
  const [cardId, setCardId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [key] = useState(newKey);

  // The limit does not depend on the amount; one preview serves the whole screen.
  const preview = useWithdrawPreview(null);
  const p = preview.data;
  const max = p ? BigInt(p.max) : 0n;
  const digits = typed ?? (max > 0n ? (max / 100n).toString() : '');
  const setDigits = (value: string) => setTyped(value);

  const amount = digits ? BigInt(`${digits}00`) : 0n;
  const tooMuch = p !== undefined && amount > max;
  const card = cards.data?.find((item) => item.id === cardId) ?? cards.data?.[0] ?? null;
  const percent = p ? formatPercent(p.fee_bps) : '';

  const submit = async () => {
    if (!card) return;
    setBusy(true);
    try {
      await endpoints.withdraw({
        amount: amount.toString(),
        card_id: card.id,
        idempotency_key: key,
      });
      void client.invalidateQueries({ queryKey: queryKeys.wallet });
      void client.invalidateQueries({ queryKey: queryKeys.walletTransactions });
      showNotice(t('withdraw.done'));
      leave('/wallet');
    } catch (error) {
      showNotice(errorText(error));
      void preview.refetch();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg2 }}>
      <BarHeader title={t('withdraw.title')} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}
        >
          {p ? (
            <Card style={{ gap: theme.spacing.sm }}>
              <AppText color="text2">{t('withdraw.have')}</AppText>
              <AppText>
                <AppText size="amountLarge" weight="bold">
                  {texts.amount(p.real)}
                </AppText>
                <AppText size="title" weight="semibold">{` ${t('common.currency')}`}</AppText>
              </AppText>
              {p.holds.map((hold) => (
                <View key={hold.order_number}>
                  <Separator />
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: theme.spacing.md,
                      paddingTop: theme.spacing.sm,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <AppText size="bodyLarge">
                        {t('qr.fee', {
                          percent: hold.fee_bps === null ? '' : formatPercent(hold.fee_bps),
                        })}
                      </AppText>
                      <AppText color="text2">
                        {t('withdraw.holdLine', {
                          number: hold.order_number,
                          price: texts.amount(hold.price),
                        })}
                      </AppText>
                    </View>
                    <AppText size="bodyLarge" weight="bold" color="orange">
                      {texts.amount(hold.fee)}
                    </AppText>
                  </View>
                </View>
              ))}
              <Separator />
              <View style={{ flexDirection: 'row', paddingTop: theme.spacing.sm }}>
                <AppText size="bodyLarge" style={{ flex: 1 }}>
                  {t('withdraw.bankFee')}
                </AppText>
                <AppText size="bodyLarge" weight="bold">{`${percent}%`}</AppText>
              </View>
            </Card>
          ) : null}

          <Card>
            <AmountInput
              label={t('withdraw.how')}
              digits={digits}
              onChange={setDigits}
              error={tooMuch}
            />
          </Card>

          {tooMuch && p ? (
            <View
              style={{
                flexDirection: 'row',
                gap: theme.spacing.md,
                padding: theme.spacing.lg,
                borderRadius: theme.radius.card,
                backgroundColor: theme.colors.redSoft,
              }}
            >
              <TriangleAlert size={24} color={theme.colors.red} />
              <View style={{ flex: 1, gap: theme.spacing.sm }}>
                {BigInt(p.must_keep) > 0n ? (
                  <AppText size="bodyLarge" weight="bold">
                    {t('withdraw.mustKeepTitle', { must_keep: texts.money(p.must_keep) })}
                  </AppText>
                ) : null}
                <AppText size="bodyLarge" color="text2">
                  {t('withdraw.maxLine', {
                    max: texts.money(p.max),
                    percent,
                    fee: texts.money(p.max_fee),
                  })}
                </AppText>
                {max > 0n ? (
                  <Button
                    variant="secondary"
                    title={t('withdraw.useMax', { amount: texts.money(p.max) })}
                    onPress={() => setDigits((max / 100n).toString())}
                    style={{ alignSelf: 'flex-start' }}
                  />
                ) : null}
              </View>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            onPress={() => (card ? setPicking(true) : router.push('/cards/new'))}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.md,
              padding: theme.spacing.lg,
              borderRadius: theme.radius.card,
              backgroundColor: theme.colors.surface,
            }}
          >
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: theme.radius.md,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.orange,
              }}
            >
              {card ? (
                <CreditCard size={24} color={theme.colors.barText} />
              ) : (
                <Plus size={24} color={theme.colors.barText} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <AppText color="text2">{t('withdraw.to')}</AppText>
              <AppText size="bodyLarge" weight="bold">
                {card
                  ? `${t(`cards.brands.${card.brand}`)} · •••• ${card.last4}`
                  : t('pay.addCard')}
              </AppText>
            </View>
            <ChevronRight size={22} color={theme.colors.text2} />
          </Pressable>

          <View style={{ flexDirection: 'row', gap: theme.spacing.md, padding: theme.spacing.sm }}>
            <Info size={22} color={theme.colors.brandText} style={{ marginTop: 1 }} />
            <AppText size="bodyLarge" color="text2" style={{ flex: 1 }}>
              {t('withdraw.info')}
            </AppText>
          </View>
        </ScrollView>
        <Footer>
          <View style={{ gap: theme.spacing.sm, paddingBottom: insets.bottom }}>
            {p && !p.enabled ? (
              <AppText color="text2" style={{ textAlign: 'center' }}>
                {t('withdraw.disabled')}
              </AppText>
            ) : null}
            <Button
              title={t('withdraw.submit')}
              loading={busy}
              disabled={!p?.enabled || !card || amount === 0n || tooMuch}
              onPress={() => void submit()}
            />
          </View>
        </Footer>
      </KeyboardAvoidingView>

      <BottomSheet visible={picking} onClose={() => setPicking(false)}>
        <AppText size="title" weight="bold" accessibilityRole="header">
          {t('withdraw.chooseCard')}
        </AppText>
        <MethodList>
          {(cards.data ?? []).map((item) => (
            <MethodRow
              key={item.id}
              icon={CreditCard}
              color="orange"
              title={t(`cards.brands.${item.brand}`)}
              subtitle={`•••• ${item.last4}`}
              selected={item.id === card?.id}
              onPress={() => {
                setCardId(item.id);
                setPicking(false);
              }}
            />
          ))}
          <MethodRow
            icon={Plus}
            color="text2"
            title={t('pay.addCard')}
            selected={false}
            onPress={() => {
              setPicking(false);
              router.push('/cards/new');
            }}
            last
          />
        </MethodList>
      </BottomSheet>
    </View>
  );
}
