import { Redirect, router } from 'expo-router';
import { Check, Glasses, Lock, ScanFace, Sun, UserRound } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { ApiError } from '../../src/api/client';
import { endpoints } from '../../src/api/endpoints';
import type { DuplicatePersonParams } from '../../src/api/types';
import { useErrorText } from '../../src/api/use-error-text';
import { AppText } from '../../src/components/AppText';
import { Button } from '../../src/components/ui/Button';
import { Screen } from '../../src/components/ui/Screen';
import { StepHeader } from '../../src/components/ui/StepHeader';
import { sessionTokenStore, useSession } from '../../src/store/session';
import { useSignup } from '../../src/store/signup';
import { useTheme } from '../../src/theme/ThemeProvider';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * K3c: face check (step 4/5). With the real provider the MyID SDK opens its own camera
 * screen here; the mock only plays the steps and completes the session.
 */
export default function FaceScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const errorText = useErrorText();
  const session = useSignup((state) => state.identitySession);
  const setDuplicate = useSignup((state) => state.setDuplicate);
  const [phase, setPhase] = useState<'idle' | 'detected' | 'checking'>('idle');
  const [error, setError] = useState<string | null>(null);

  if (!session) return <Redirect href="/identity" />;

  const start = async () => {
    setError(null);
    setPhase('detected');
    await wait(1200);
    setPhase('checking');
    try {
      const me = await endpoints.completeIdentity(session);
      useSignup.getState().setIdentitySession(null);
      useSession.getState().setUser(me);
      router.replace('/role');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'AUTH_DUPLICATE_PERSON') {
        // The backend removed this registration; show K3d with the existing account.
        setDuplicate(e.params as unknown as DuplicatePersonParams);
        await sessionTokenStore.clear();
        return;
      }
      setPhase('idle');
      setError(errorText(e));
    }
  };

  const tips = [
    { icon: Sun, label: t('face.tipLight') },
    { icon: Glasses, label: t('face.tipGlasses') },
    { icon: UserRound, label: t('face.tipHat') },
  ];
  const active = phase !== 'idle';

  return (
    <Screen
      header={<StepHeader step={4} />}
      footer={
        <>
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm, justifyContent: 'center' }}>
            <Lock size={18} color={theme.colors.text2} />
            <AppText size="secondary" color="text2" style={{ textAlign: 'center', flexShrink: 1 }}>
              {t('face.privacy')}
            </AppText>
          </View>
          <Button
            title={phase === 'checking' ? t('face.checking') : t('face.start')}
            icon={ScanFace}
            loading={phase === 'checking'}
            disabled={active}
            onPress={() => void start()}
          />
        </>
      }
    >
      <View style={{ alignItems: 'center', gap: theme.spacing.sm }}>
        <AppText
          size="titleLarge"
          weight="bold"
          style={{ textAlign: 'center' }}
          accessibilityRole="header"
        >
          {t('face.title')}
        </AppText>
        <AppText size="bodyLarge" color="text2" style={{ textAlign: 'center' }}>
          {t('face.subtitle')}
        </AppText>
      </View>

      <View style={{ alignItems: 'center' }}>
        <View
          style={{
            width: 220,
            height: 280,
            borderRadius: 140,
            borderWidth: 5,
            borderColor: active ? theme.colors.brand : theme.colors.sep,
            backgroundColor: theme.colors.surface2,
            alignItems: 'center',
            justifyContent: 'flex-end',
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: 90,
              height: 90,
              borderRadius: 45,
              backgroundColor: theme.colors.border,
              opacity: 0.5,
              marginBottom: 12,
            }}
          />
          <View
            style={{
              width: 170,
              height: 80,
              borderTopLeftRadius: 85,
              borderTopRightRadius: 85,
              backgroundColor: theme.colors.border,
              opacity: 0.5,
            }}
          />
        </View>
      </View>

      <View style={{ alignItems: 'center', gap: theme.spacing.md, minHeight: 96 }}>
        {active ? (
          <>
            <View
              style={{
                flexDirection: 'row',
                gap: theme.spacing.sm,
                alignItems: 'center',
                paddingHorizontal: theme.spacing.lg,
                paddingVertical: theme.spacing.sm,
                borderRadius: 999,
                backgroundColor: theme.colors.greenSoft,
              }}
            >
              <Check size={20} color={theme.colors.green} strokeWidth={3} />
              <AppText weight="bold" color="green">
                {t('face.detected')}
              </AppText>
            </View>
            <AppText size="bodyLarge" weight="bold" style={{ textAlign: 'center' }}>
              {t('face.blink')}
            </AppText>
          </>
        ) : error ? (
          <AppText color="red" style={{ textAlign: 'center' }}>
            {error}
          </AppText>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        {tips.map(({ icon: Icon, label }) => (
          <View
            key={label}
            style={{
              flex: 1,
              alignItems: 'center',
              gap: theme.spacing.sm,
              padding: theme.spacing.md,
              borderRadius: theme.radius.lg,
              backgroundColor: theme.colors.surface2,
            }}
          >
            <Icon size={24} color={theme.colors.text} />
            <AppText size="secondary" color="text2" style={{ textAlign: 'center' }}>
              {label}
            </AppText>
          </View>
        ))}
      </View>
    </Screen>
  );
}
