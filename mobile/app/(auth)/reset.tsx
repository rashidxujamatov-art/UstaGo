import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import type { OtpTicket } from '../../src/api/types';
import { endpoints } from '../../src/api/endpoints';
import { useErrorText } from '../../src/api/use-error-text';
import { AppText } from '../../src/components/AppText';
import { Button } from '../../src/components/ui/Button';
import { OtpInput } from '../../src/components/ui/OtpInput';
import { Screen } from '../../src/components/ui/Screen';
import { StepHeader } from '../../src/components/ui/StepHeader';
import { TextField } from '../../src/components/ui/TextField';
import { formatLocalPhone, isStrongPassword, phoneDigits, toE164 } from '../../src/lib/input';
import { usePreferences } from '../../src/store/preferences';
import { useTheme } from '../../src/theme/ThemeProvider';

/** Password reset by SMS (docs/01 §2). Not drawn on the canvas; follows the K2/K3 style. */
export default function ResetScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const errorText = useErrorText();
  const language = usePreferences((state) => state.language);
  const [phone, setPhone] = useState('');
  const [ticket, setTicket] = useState<OtpTicket | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () =>
    run(async () => {
      const e164 = toE164(phone);
      if (!e164) return;
      const { otp } = await endpoints.requestPasswordReset({ phone: e164, lang: language });
      setTicket(otp);
    });

  const save = () =>
    run(async () => {
      const e164 = toE164(phone);
      if (!e164) return;
      if (!isStrongPassword(password)) {
        setError(t('auth.weakPassword'));
        return;
      }
      await endpoints.confirmPasswordReset({ phone: e164, code, new_password: password });
      setDone(true);
    });

  const phoneValid = toE164(phone) !== null;

  return (
    <Screen
      header={<StepHeader />}
      footer={
        done ? (
          <Button
            title={t('auth.signIn')}
            onPress={() => router.replace({ pathname: '/sign', params: { tab: 'login' } })}
          />
        ) : ticket ? (
          <Button
            title={t('reset.save')}
            loading={busy}
            disabled={code.length !== ticket.length}
            onPress={() => void save()}
          />
        ) : (
          <Button
            title={t('reset.sendCode')}
            loading={busy}
            disabled={!phoneValid}
            onPress={() => void sendCode()}
          />
        )
      }
    >
      <View style={{ gap: theme.spacing.sm }}>
        <AppText size="titleLarge" weight="bold" accessibilityRole="header">
          {t('reset.title')}
        </AppText>
        <AppText size="bodyLarge" color="text2">
          {done ? t('reset.done') : t('reset.subtitle')}
        </AppText>
      </View>

      {done ? null : (
        <>
          <TextField
            label={t('auth.phoneLabel')}
            prefix="+998"
            value={formatLocalPhone(phone)}
            onChangeText={(text) => {
              setPhone(phoneDigits(text));
              setTicket(null);
            }}
            keyboardType="phone-pad"
            placeholder="90 123 45 67"
          />
          {ticket ? (
            <>
              <OtpInput
                length={ticket.length}
                value={code}
                onChange={setCode}
                error={Boolean(error)}
                accessibilityLabel={t('otp.codeLabel')}
              />
              <TextField
                label={t('reset.newPassword')}
                value={password}
                onChangeText={setPassword}
                secret
                autoCapitalize="none"
                textContentType="newPassword"
                hint={t('auth.passwordHint')}
              />
            </>
          ) : null}
        </>
      )}
      {error ? <AppText color="red">{error}</AppText> : null}
    </Screen>
  );
}
