import { Redirect, router } from 'expo-router';
import { Clock, ShieldCheck, Smartphone } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { endpoints } from '../../src/api/endpoints';
import { useErrorText } from '../../src/api/use-error-text';
import { completeSignIn } from '../../src/auth/session-actions';
import { AppText } from '../../src/components/AppText';
import { Button } from '../../src/components/ui/Button';
import { OtpInput } from '../../src/components/ui/OtpInput';
import { Screen } from '../../src/components/ui/Screen';
import { StepHeader } from '../../src/components/ui/StepHeader';
import { deviceInfo } from '../../src/lib/device';
import { formatPhone } from '../../src/lib/format';
import { formatCountdown } from '../../src/lib/input';
import { usePreferences } from '../../src/store/preferences';
import { useSignup } from '../../src/store/signup';
import { useTheme } from '../../src/theme/ThemeProvider';

/** Seconds left until a new code may be requested. */
function useResendCountdown(sentAt: number | null, delaySec: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return sentAt ? Math.max(0, (sentAt + delaySec * 1000 - Math.max(now, sentAt)) / 1000) : 0;
}

/** K3: SMS code for a new account (step 2/5) or for sign-in on a new device. */
export default function OtpScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const errorText = useErrorText();
  const language = usePreferences((state) => state.language);
  const { phone, purpose, otp, otpSentAt, startOtp, clearOtp } = useSignup();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const left = useResendCountdown(otpSentAt, otp?.resend_after_sec ?? 60);

  const verify = useCallback(
    async (value: string) => {
      if (!phone || !purpose) return;
      setBusy(true);
      setError(null);
      try {
        const result = await endpoints.verifyOtp({
          purpose,
          phone,
          code: value,
          device: await deviceInfo(),
        });
        clearOtp();
        await completeSignIn(result);
      } catch (e) {
        setError(errorText(e));
        setCode('');
      } finally {
        setBusy(false);
      }
    },
    [phone, purpose, clearOtp, errorText],
  );

  if (!phone || !purpose || !otp) return <Redirect href="/sign" />;

  const resend = async () => {
    setError(null);
    try {
      const { otp: ticket } = await endpoints.resendOtp({
        purpose,
        phone,
        lang: language,
        device: await deviceInfo(),
      });
      startOtp(phone, purpose, ticket);
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <Screen
      header={<StepHeader step={purpose === 'REGISTER' ? 2 : undefined} />}
      footer={
        <>
          <View
            style={{
              flexDirection: 'row',
              gap: theme.spacing.md,
              alignItems: 'center',
              padding: theme.spacing.lg,
              borderRadius: theme.radius.card,
              backgroundColor: theme.colors.surface2,
            }}
          >
            <ShieldCheck size={24} color={theme.colors.brandText} />
            <AppText color="text2" style={{ flex: 1 }}>
              {t('otp.warning')}
            </AppText>
          </View>
          <Button
            title={t('otp.confirm')}
            loading={busy}
            disabled={code.length !== otp.length}
            onPress={() => void verify(code)}
          />
        </>
      }
    >
      <View style={{ alignItems: 'center', gap: theme.spacing.md }}>
        <View
          style={{
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: theme.colors.brandSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Smartphone size={40} color={theme.colors.brandText} />
        </View>
        <AppText size="titleLarge" weight="bold" accessibilityRole="header">
          {t('otp.title')}
        </AppText>
        <AppText size="bodyLarge" color="text2" style={{ textAlign: 'center' }}>
          <Trans
            i18nKey="otp.sentTo"
            values={{ length: otp.length, phone: formatPhone(phone) }}
            components={{ b: <AppText weight="bold" size="bodyLarge" /> }}
          />
        </AppText>
      </View>

      <OtpInput
        length={otp.length}
        value={code}
        error={Boolean(error)}
        accessibilityLabel={t('otp.codeLabel')}
        onChange={(value) => {
          setCode(value);
          if (value.length === otp.length && !busy) void verify(value);
        }}
      />
      {error ? (
        <AppText color="red" style={{ textAlign: 'center' }}>
          {error}
        </AppText>
      ) : null}

      <View style={{ alignItems: 'center', gap: theme.spacing.sm }}>
        {left > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <Clock size={20} color={theme.colors.text2} />
            <AppText color="text2" size="bodyLarge">
              <Trans
                i18nKey="otp.resendIn"
                values={{ time: formatCountdown(left) }}
                components={{ b: <AppText weight="bold" size="bodyLarge" /> }}
              />
            </AppText>
          </View>
        ) : (
          <Button variant="link" title={t('otp.resend')} onPress={() => void resend()} />
        )}
        <Button
          variant="link"
          title={t('otp.changeNumber')}
          onPress={() => {
            clearOtp();
            router.back();
          }}
        />
      </View>
    </Screen>
  );
}
