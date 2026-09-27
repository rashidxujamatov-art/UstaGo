import { useQueryClient } from '@tanstack/react-query';
import { CameraView, scanFromURLAsync, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import {
  Camera as CameraIcon,
  Check,
  ExternalLink,
  ImagePlus,
  QrCode,
  ShieldCheck,
  X,
} from 'lucide-react-native';
import { type ReactNode, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { endpoints } from '../api/endpoints';
import { queryKeys } from '../api/queries';
import { useErrorText } from '../api/use-error-text';
import { AppText } from '../components/AppText';
import { BarHeader } from '../components/ui/BarHeader';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { TextField } from '../components/ui/TextField';
import { formatLocalPhone, phoneDigits, toE164 } from '../lib/input';
import { leave } from '../lib/navigation';
import { showNotice } from '../lib/notice';
import { Footer } from '../orders/OrderParts';
import { useTheme } from '../theme/ThemeProvider';

/** A placeholder until the real Xolis deep link / store page is known (docs/01 §13). */
const XOLIS_APP_URL = 'https://xolis.uz';

/** BJ10: register the executor's Paynet Xolis QR and phone; an admin checks it (AD1). */
export function XolisConnect() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const errorText = useErrorText();
  const client = useQueryClient();
  const [permission, requestPermission] = useCameraPermissions();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [qr, setQr] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const handledScan = useRef(false);

  const e164 = toE164(phone);
  const errors = submitted
    ? {
        qr: qr.trim().length === 0 ? t('tax.xolisQrRequired') : undefined,
        phone: !e164 ? t('auth.invalidPhone') : undefined,
      }
    : {};

  const openScanner = async () => {
    handledScan.current = false;
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        showNotice(t('tax.cameraDenied'));
        return;
      }
    }
    setScannerOpen(true);
  };

  const onScanned = (data: string) => {
    if (handledScan.current) return;
    handledScan.current = true;
    setQr(data);
    setScannerOpen(false);
  };

  const pickFromPhoto = async () => {
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] });
    const asset = picked.canceled ? undefined : picked.assets[0];
    if (!asset) return;
    try {
      const results = await scanFromURLAsync(asset.uri, ['qr']);
      const first = results[0];
      if (first) setQr(first.data);
      else showNotice(t('tax.xolisQrNotFound'));
    } catch {
      showNotice(t('tax.xolisQrNotFound'));
    }
  };

  const submit = async () => {
    setSubmitted(true);
    if (qr.trim().length === 0 || !e164) return;
    setSubmitting(true);
    try {
      client.setQueryData(
        queryKeys.taxStatus,
        await endpoints.taxConnectXolis({ qr: qr.trim(), phone: e164 }),
      );
      leave('/tax');
    } catch (error) {
      showNotice(errorText(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg2 }}>
      <BarHeader title={t('tax.xolisTitle')} />
      <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}>
        <View
          style={{
            flexDirection: 'row',
            gap: theme.spacing.md,
            padding: theme.spacing.lg,
            borderRadius: theme.radius.card,
            backgroundColor: theme.colors.brandSoft,
          }}
        >
          <QrCode size={22} color={theme.colors.brandText} style={{ marginTop: 1 }} />
          <AppText color="text2" style={{ flex: 1 }}>
            {t('tax.xolisIntro')}
          </AppText>
        </View>

        <Card>
          <Step
            done
            title={t('tax.xolisStep1Title')}
            subtitle={t('tax.xolisStep1Subtitle')}
            action={
              <Button
                variant="link"
                icon={ExternalLink}
                title={t('tax.xolisOpenApp')}
                onPress={() => void Linking.openURL(XOLIS_APP_URL).catch(() => undefined)}
              />
            }
          />
          <Step
            active
            title={t('tax.xolisStep2Title')}
            subtitle={t('tax.xolisStep2Subtitle')}
            action={
              <View style={{ gap: theme.spacing.md }}>
                <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                  <Button
                    icon={CameraIcon}
                    title={t('tax.scan')}
                    onPress={() => void openScanner()}
                    style={{ flex: 1 }}
                  />
                  <Button
                    variant="secondary"
                    icon={ImagePlus}
                    title={t('tax.fromPhoto')}
                    onPress={() => void pickFromPhoto()}
                    style={{ flex: 1 }}
                  />
                </View>
                <AppText size="secondary" color={qr ? 'green' : errors.qr ? 'red' : 'text2'}>
                  {qr ? t('tax.xolisQrConnected') : (errors.qr ?? t('tax.xolisQrHint'))}
                </AppText>
                <TextField
                  label={t('tax.xolisPhoneLabel')}
                  prefix="+998"
                  value={formatLocalPhone(phone)}
                  onChangeText={(text) => setPhone(phoneDigits(text))}
                  keyboardType="number-pad"
                  error={errors.phone}
                />
              </View>
            }
          />
          <Step title={t('tax.xolisStep3Title')} subtitle={t('tax.xolisStep3Subtitle')} last />
        </Card>

        <View
          style={{
            flexDirection: 'row',
            gap: theme.spacing.md,
            padding: theme.spacing.lg,
            borderRadius: theme.radius.card,
            backgroundColor: theme.colors.surface,
          }}
        >
          <ShieldCheck size={22} color={theme.colors.green} style={{ marginTop: 1 }} />
          <AppText color="text2" style={{ flex: 1 }}>
            {t('tax.xolisSecureNote')}
          </AppText>
        </View>
      </ScrollView>

      <Footer>
        <View style={{ paddingBottom: insets.bottom }}>
          <Button
            icon={Check}
            title={t('tax.xolisSubmit')}
            loading={submitting}
            onPress={() => void submit()}
          />
        </View>
      </Footer>

      <Modal
        visible={scannerOpen}
        animationType="slide"
        onRequestClose={() => setScannerOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'black' }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={(result) => onScanned(result.data)}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            onPress={() => setScannerOpen(false)}
            style={{
              position: 'absolute',
              top: insets.top + theme.spacing.lg,
              right: theme.spacing.lg,
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.scrim,
            }}
          >
            <X size={24} color="#FFFFFF" />
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

function Step({
  done = false,
  active = false,
  last = false,
  title,
  subtitle,
  action,
}: {
  done?: boolean;
  active?: boolean;
  last?: boolean;
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  const theme = useTheme();
  const dotColor = done ? theme.colors.green : active ? theme.colors.brand : theme.colors.border;
  return (
    <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
      <View style={{ alignItems: 'center', width: 28 }}>
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: done ? 0 : 2,
            borderColor: dotColor,
            backgroundColor: done ? theme.colors.green : 'transparent',
          }}
        >
          {done ? <Check size={18} color={theme.colors.barText} /> : null}
        </View>
        {last ? null : (
          <View style={{ flex: 1, width: 2, backgroundColor: theme.colors.sep, marginTop: 4 }} />
        )}
      </View>
      <View style={{ flex: 1, gap: theme.spacing.sm, paddingBottom: last ? 0 : theme.spacing.lg }}>
        <AppText size="bodyLarge" weight="bold">
          {title}
        </AppText>
        <AppText color="text2">{subtitle}</AppText>
        {action}
      </View>
    </View>
  );
}
