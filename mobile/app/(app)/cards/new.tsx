import { useQueryClient } from '@tanstack/react-query';
import { Check, CreditCard } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { endpoints } from '../../../src/api/endpoints';
import { queryKeys } from '../../../src/api/queries';
import { useErrorText } from '../../../src/api/use-error-text';
import { AppText } from '../../../src/components/AppText';
import { BarHeader } from '../../../src/components/ui/BarHeader';
import { Button } from '../../../src/components/ui/Button';
import { Card } from '../../../src/components/ui/Card';
import { OtpInput } from '../../../src/components/ui/OtpInput';
import { TextField } from '../../../src/components/ui/TextField';
import { cardDigits, formatCardExpiry, formatCardNumber } from '../../../src/lib/input';
import { leave } from '../../../src/lib/navigation';
import { showNotice } from '../../../src/lib/notice';
import { Footer } from '../../../src/orders/OrderParts';
import { SecureNote } from '../../../src/payments/PaymentParts';
import { useTheme } from '../../../src/theme/ThemeProvider';

const CODE_LENGTH = 6;

/**
 * Adds a bank card (BY5, BJ6, BJ7): number and expiry go to the card provider, which
 * sends an SMS code to the card owner's phone. Only the provider token is kept.
 */
export default function NewCardScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const errorText = useErrorText();
  const client = useQueryClient();
  const [number, setNumber] = useState('');
  const [expire, setExpire] = useState('');
  const [pending, setPending] = useState<{ id: string; phone: string | null } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const digits = cardDigits(number);
  const ready = pending ? code.length === CODE_LENGTH : digits.length === 16 && expire.length === 5;

  const submit = async () => {
    setBusy(true);
    try {
      if (!pending) {
        const added = await endpoints.addCard({ number: digits, expire });
        setPending({ id: added.card_id, phone: added.phone_masked });
      } else {
        await endpoints.verifyCard(pending.id, code);
        await client.invalidateQueries({ queryKey: queryKeys.cards });
        leave('/wallet');
      }
    } catch (error) {
      showNotice(errorText(error));
      if (pending) setCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg2 }}>
      <BarHeader title={t('cards.title')} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}
        >
          {pending ? (
            <Card>
              <AppText size="title" weight="bold" accessibilityRole="header">
                {t('cards.codeTitle')}
              </AppText>
              <AppText color="text2">
                {pending.phone
                  ? t('cards.codeSent', { phone: pending.phone })
                  : t('cards.codeSentAny')}
              </AppText>
              <OtpInput
                length={CODE_LENGTH}
                value={code}
                onChange={setCode}
                accessibilityLabel={t('cards.codeTitle')}
              />
            </Card>
          ) : (
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
                <CreditCard size={28} color={theme.colors.brandText} />
                <AppText size="bodyLarge" weight="semibold">
                  {`${t('cards.brands.UZCARD')} · ${t('cards.brands.HUMO')} · ${t('cards.brands.VISA')} · ${t('cards.brands.MASTERCARD')}`}
                </AppText>
              </View>
              <TextField
                label={t('cards.number')}
                value={formatCardNumber(number)}
                onChangeText={setNumber}
                keyboardType="number-pad"
                autoComplete="cc-number"
                placeholder="8600 0000 0000 0000"
              />
              <TextField
                label={t('cards.expire')}
                value={expire}
                onChangeText={(text) => setExpire(formatCardExpiry(text))}
                keyboardType="number-pad"
                autoComplete="cc-exp"
                placeholder={t('cards.expireHint')}
              />
            </Card>
          )}
          <SecureNote>{t('topup.secure')}</SecureNote>
        </ScrollView>
        <Footer>
          <View style={{ paddingBottom: insets.bottom }}>
            <Button
              icon={pending ? Check : undefined}
              title={t(pending ? 'cards.confirm' : 'cards.next')}
              loading={busy}
              disabled={!ready}
              onPress={() => void submit()}
            />
          </View>
        </Footer>
      </KeyboardAvoidingView>
    </View>
  );
}
