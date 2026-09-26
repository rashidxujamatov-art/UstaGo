import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { CircleCheck, MessageSquare } from 'lucide-react-native';
import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { ApiError } from '../../src/api/client';
import { endpoints } from '../../src/api/endpoints';
import { useErrorText } from '../../src/api/use-error-text';
import { completeSignIn } from '../../src/auth/session-actions';
import { AppText } from '../../src/components/AppText';
import { Avatar } from '../../src/components/ui/Avatar';
import { Button } from '../../src/components/ui/Button';
import { Checkbox } from '../../src/components/ui/Checkbox';
import { Screen } from '../../src/components/ui/Screen';
import { Segmented } from '../../src/components/ui/Segmented';
import { StepHeader } from '../../src/components/ui/StepHeader';
import { TextField } from '../../src/components/ui/TextField';
import { deviceInfo } from '../../src/lib/device';
import {
  formatLocalPhone,
  initials,
  isStrongPassword,
  isValidEmail,
  phoneDigits,
  toE164,
} from '../../src/lib/input';
import { usePreferences } from '../../src/store/preferences';
import { useSignup } from '../../src/store/signup';
import { useTheme } from '../../src/theme/ThemeProvider';

type Tab = 'register' | 'login';
type Field = 'referral' | 'phone' | 'email' | 'password' | 'terms' | 'form';
type Errors = Partial<Record<Field, string>>;

/** Which field an API error belongs to. */
const FIELD_OF: Record<string, Field> = {
  AUTH_REFERRAL_REQUIRED: 'referral',
  AUTH_REFERRAL_INVALID: 'referral',
  AUTH_PHONE_TAKEN: 'phone',
  AUTH_EMAIL_TAKEN: 'email',
  AUTH_WEAK_PASSWORD: 'password',
};

/** K2: sign-up (with the mandatory invite code) and sign-in tabs. */
export default function SignScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const errorText = useErrorText();
  const params = useLocalSearchParams<{ tab?: Tab }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'login' ? 'login' : 'register');
  const language = usePreferences((state) => state.language);
  const { referralCode, setReferral, startOtp } = useSignup();

  const [codeInput, setCodeInput] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  const config = useQuery({ queryKey: ['config'], queryFn: endpoints.config });
  const invite = useQuery({
    queryKey: ['invite', referralCode],
    queryFn: () => endpoints.invite(referralCode ?? ''),
    enabled: Boolean(referralCode),
    retry: false,
  });

  const fail = (error: unknown) => {
    const field = error instanceof ApiError ? (FIELD_OF[error.code] ?? 'form') : 'form';
    setErrors({ [field]: errorText(error) });
  };

  const submitRegister = async () => {
    const e164 = toE164(phone);
    const next: Errors = {};
    if (!referralCode && config.data?.referral_required !== false)
      next.referral = t('auth.referralRequired');
    if (invite.isError) next.referral = errorText(invite.error);
    if (!e164) next.phone = t('auth.invalidPhone');
    if (!isValidEmail(email)) next.email = t('auth.invalidEmail');
    if (!isStrongPassword(password)) next.password = t('auth.weakPassword');
    if (!terms) next.terms = t('auth.termsRequired');
    setErrors(next);
    if (Object.keys(next).length > 0 || !e164) return;

    setBusy(true);
    try {
      const { otp } = await endpoints.register({
        phone: e164,
        email: email.trim(),
        password,
        referral_code: referralCode ?? undefined,
        lang: language,
        device: await deviceInfo(),
      });
      startOtp(e164, 'REGISTER', otp);
      router.push('/otp');
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  const submitLogin = async () => {
    const e164 = toE164(phone);
    if (!e164) return setErrors({ phone: t('auth.invalidPhone') });
    setErrors({});
    setBusy(true);
    try {
      const result = await endpoints.login({
        phone: e164,
        password,
        lang: language,
        device: await deviceInfo(),
      });
      if (result.otp_required) {
        startOtp(e164, 'LOGIN', result.otp);
        router.push('/otp');
      } else {
        await completeSignIn(result);
      }
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  const phoneField = (
    <TextField
      label={t('auth.phoneLabel')}
      prefix="+998"
      value={formatLocalPhone(phone)}
      onChangeText={(text) => setPhone(phoneDigits(text))}
      keyboardType="phone-pad"
      textContentType="telephoneNumber"
      autoComplete="tel"
      placeholder="90 123 45 67"
      hint={tab === 'register' ? t('auth.phoneHint') : undefined}
      error={errors.phone}
    />
  );
  const passwordField = (
    <TextField
      label={t('auth.passwordLabel')}
      value={password}
      onChangeText={setPassword}
      secret
      autoCapitalize="none"
      textContentType={tab === 'register' ? 'newPassword' : 'password'}
      autoComplete={tab === 'register' ? 'new-password' : 'current-password'}
      hint={tab === 'register' ? t('auth.passwordHint') : undefined}
      error={errors.password}
    />
  );

  return (
    <Screen
      header={
        <StepHeader
          step={tab === 'register' ? 1 : undefined}
          onBack={() => (router.canGoBack() ? router.back() : router.replace('/welcome'))}
        />
      }
      footer={
        <>
          {errors.form ? (
            <AppText color="red" style={{ textAlign: 'center' }}>
              {errors.form}
            </AppText>
          ) : null}
          {tab === 'register' ? (
            <Button
              title={t('auth.getSmsCode')}
              icon={MessageSquare}
              loading={busy}
              onPress={() => void submitRegister()}
            />
          ) : (
            <Button title={t('auth.signIn')} loading={busy} onPress={() => void submitLogin()} />
          )}
        </>
      }
    >
      <Segmented<Tab>
        value={tab}
        onChange={(value) => {
          setTab(value);
          setErrors({});
        }}
        options={[
          { value: 'register', label: t('auth.register') },
          { value: 'login', label: t('auth.signIn') },
        ]}
      />

      {tab === 'register' ? (
        <>
          {referralCode && !invite.isError ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.md,
                padding: theme.spacing.lg,
                borderRadius: theme.radius.card,
                backgroundColor: theme.colors.greenSoft,
              }}
            >
              {invite.data?.inviter ? (
                <Avatar
                  initials={initials(invite.data.inviter.first_name, invite.data.inviter.last_name)}
                  size={48}
                />
              ) : null}
              <View style={{ flex: 1, gap: 2 }}>
                <AppText size="bodyLarge">
                  {invite.data?.inviter ? (
                    <Trans
                      i18nKey="auth.invitedBy"
                      values={{
                        name: `${invite.data.inviter.first_name} ${invite.data.inviter.last_name}`,
                      }}
                      components={{ b: <AppText weight="bold" size="bodyLarge" /> }}
                    />
                  ) : invite.isSuccess ? (
                    t('auth.invitedPlatform')
                  ) : (
                    '…'
                  )}
                </AppText>
                <AppText color="text2">{t('auth.inviteCode', { code: referralCode })}</AppText>
                <Button
                  variant="link"
                  title={t('auth.changeInviteCode')}
                  onPress={() => setReferral(null, null)}
                  style={{ alignSelf: 'flex-start', paddingHorizontal: 0, minHeight: 32 }}
                />
              </View>
              {invite.isSuccess ? <CircleCheck size={28} color={theme.colors.green} /> : null}
            </View>
          ) : (
            <TextField
              label={t('auth.inviteCodeLabel')}
              value={codeInput}
              onChangeText={(text) => setCodeInput(text.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect={false}
              hint={t('auth.inviteCodeHint')}
              error={errors.referral ?? (invite.isError ? errorText(invite.error) : null)}
              right={
                <Button
                  variant="link"
                  title={t('auth.inviteCodeCheck')}
                  disabled={codeInput.trim().length < 4}
                  onPress={() => {
                    setErrors({});
                    setReferral(codeInput.trim(), null);
                  }}
                />
              }
            />
          )}
          {phoneField}
          <TextField
            label={t('auth.emailLabel')}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            error={errors.email}
          />
          {passwordField}
          <Checkbox
            checked={terms}
            onChange={setTerms}
            accessibilityLabel={t('auth.termsRequired')}
          >
            <AppText size="bodyLarge">
              <Trans
                i18nKey="auth.acceptTerms"
                components={{
                  em: <AppText weight="semibold" color="brandText" size="bodyLarge" />,
                }}
              />
            </AppText>
            {errors.terms ? (
              <AppText size="secondary" color="red">
                {errors.terms}
              </AppText>
            ) : null}
          </Checkbox>
        </>
      ) : (
        <>
          {phoneField}
          {passwordField}
          <Button
            variant="link"
            title={t('auth.forgotPassword')}
            onPress={() => router.push('/reset')}
            style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }}
          />
        </>
      )}
    </Screen>
  );
}
