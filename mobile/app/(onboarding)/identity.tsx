import { router } from 'expo-router';
import { Check, ScanFace, ShieldCheck } from 'lucide-react-native';
import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { ApiError } from '../../src/api/client';
import { endpoints } from '../../src/api/endpoints';
import { useErrorText } from '../../src/api/use-error-text';
import { AppText } from '../../src/components/AppText';
import { Button } from '../../src/components/ui/Button';
import { Checkbox } from '../../src/components/ui/Checkbox';
import { Screen } from '../../src/components/ui/Screen';
import { Segmented } from '../../src/components/ui/Segmented';
import { StepHeader } from '../../src/components/ui/StepHeader';
import { TextField } from '../../src/components/ui/TextField';
import { appOperator } from '../../src/lib/app-config';
import { deviceInfo } from '../../src/lib/device';
import {
  birthDateToIso,
  formatBirthDateInput,
  formatDocNumber,
  isValidDocNumber,
} from '../../src/lib/input';
import { useSession } from '../../src/store/session';
import { useTheme } from '../../src/theme/ThemeProvider';

type DocType = 'ID_CARD' | 'PASSPORT';

/** K3b: document and consent for the MyID check (step 3/5). */
export default function IdentityScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const errorText = useErrorText();
  const operator = appOperator();
  const [docType, setDocType] = useState<DocType>('ID_CARD');
  const [docNumber, setDocNumber] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<{
    doc?: string;
    date?: string;
    consent?: string;
    form?: string;
  }>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const isoDate = birthDateToIso(birthDate);
    const next: typeof errors = {};
    if (!isValidDocNumber(docNumber)) next.doc = t('identity.invalidDoc');
    if (!isoDate) next.date = t('identity.invalidDate');
    if (!consent) next.consent = t('identity.consentRequired');
    setErrors(next);
    if (Object.keys(next).length > 0 || !isoDate) return;

    setBusy(true);
    try {
      const session = await endpoints.startIdentity({
        doc_type: docType,
        doc_number: docNumber.replace(' ', ''),
        birth_date: isoDate,
        device_id: (await deviceInfo()).id,
      });
      router.push({ pathname: '/face', params: { session: session.session_id } });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'AUTH_IDENTITY_ALREADY_VERIFIED') {
        useSession.getState().setUser(await endpoints.me());
        return;
      }
      setErrors({ form: errorText(error) });
    } finally {
      setBusy(false);
    }
  };

  const points = [t('identity.point1'), t('identity.point2'), t('identity.point3')];

  return (
    <Screen
      header={<StepHeader step={3} hideBack />}
      footer={
        <>
          {errors.form ? (
            <AppText color="red" style={{ textAlign: 'center' }}>
              {errors.form}
            </AppText>
          ) : null}
          <Button
            title={t('identity.toFace')}
            icon={ScanFace}
            loading={busy}
            onPress={() => void submit()}
          />
        </>
      }
    >
      <View style={{ gap: theme.spacing.md }}>
        <View
          style={{
            alignSelf: 'flex-start',
            flexDirection: 'row',
            gap: theme.spacing.sm,
            alignItems: 'center',
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.sm,
            borderRadius: 999,
            backgroundColor: theme.colors.brandSoft,
          }}
        >
          <ShieldCheck size={20} color={theme.colors.brandText} />
          <AppText weight="bold" color="brandText">
            {t('identity.badge')}
          </AppText>
        </View>
        <AppText size="titleLarge" weight="bold" accessibilityRole="header">
          {t('identity.title')}
        </AppText>
        <AppText size="bodyLarge" color="text2">
          {t('identity.subtitle')}
        </AppText>
      </View>

      <View
        style={{
          gap: theme.spacing.md,
          padding: theme.spacing.lg,
          borderRadius: theme.radius.card,
          backgroundColor: theme.colors.surface2,
        }}
      >
        {points.map((point) => (
          <View
            key={point}
            style={{ flexDirection: 'row', gap: theme.spacing.md, alignItems: 'center' }}
          >
            <Check size={22} color={theme.colors.green} strokeWidth={3} />
            <AppText size="bodyLarge" style={{ flex: 1 }}>
              {point}
            </AppText>
          </View>
        ))}
      </View>

      <Segmented<DocType>
        value={docType}
        onChange={setDocType}
        options={[
          { value: 'ID_CARD', label: t('identity.idCard') },
          { value: 'PASSPORT', label: t('identity.passport') },
        ]}
      />
      <TextField
        label={t('identity.docNumber')}
        value={docNumber}
        onChangeText={(text) => setDocNumber(formatDocNumber(text))}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder="AD 1234567"
        error={errors.doc}
      />
      <TextField
        label={t('identity.birthDate')}
        value={birthDate}
        onChangeText={(text) => setBirthDate(formatBirthDateInput(text))}
        keyboardType="number-pad"
        placeholder={t('identity.birthDatePlaceholder')}
        error={errors.date}
      />
      <Checkbox
        checked={consent}
        onChange={setConsent}
        accessibilityLabel={t('identity.consentRequired')}
      >
        <AppText color="text2">
          <Trans
            i18nKey="identity.consent"
            values={{ operator: operator.name, tin: operator.tin }}
            components={{ b: <AppText weight="bold" color="brandText" /> }}
          />
        </AppText>
        {errors.consent ? (
          <AppText size="secondary" color="red">
            {errors.consent}
          </AppText>
        ) : null}
      </Checkbox>
    </Screen>
  );
}
