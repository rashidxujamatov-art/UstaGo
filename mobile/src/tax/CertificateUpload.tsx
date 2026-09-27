import { useQueryClient } from '@tanstack/react-query';
import { Check, FileText, ImagePlus } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { endpoints } from '../api/endpoints';
import { queryKeys } from '../api/queries';
import { useErrorText } from '../api/use-error-text';
import { AppText } from '../components/AppText';
import { BarHeader } from '../components/ui/BarHeader';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { leave } from '../lib/navigation';
import { showNotice } from '../lib/notice';
import { pickAndUploadPhoto } from '../lib/upload';
import { Footer } from '../orders/OrderParts';
import { useTheme } from '../theme/ThemeProvider';

/**
 * BJ8/BJ9 follow-up: the state tax system could not confirm the PINFL automatically, so
 * the executor uploads a certificate photo for an admin to check (AD1, docs/01 §9).
 */
export function CertificateUpload() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const errorText = useErrorText();
  const client = useQueryClient();
  const [photo, setPhoto] = useState<{ key: string; uri: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const pick = async () => {
    setUploading(true);
    try {
      const result = await pickAndUploadPhoto('TAX_CERTIFICATE');
      if (result) setPhoto(result);
    } catch {
      showNotice(t('tax.certificateUploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!photo) return;
    setSubmitting(true);
    try {
      client.setQueryData(queryKeys.taxStatus, await endpoints.taxSelfEmployed(photo.key));
      leave('/tax');
    } catch (error) {
      showNotice(errorText(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg2 }}>
      <BarHeader title={t('tax.certificateTitle')} />
      <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}>
        <Card>
          <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
            <FileText size={22} color={theme.colors.brandText} style={{ marginTop: 1 }} />
            <AppText color="text2" style={{ flex: 1 }}>
              {t('tax.certificateIntro')}
            </AppText>
          </View>
        </Card>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('tax.certificatePick')}
          disabled={uploading}
          onPress={() => void pick()}
          style={{
            minHeight: 180,
            borderRadius: theme.radius.card,
            borderWidth: 1.5,
            borderStyle: 'dashed',
            borderColor: theme.colors.border,
            alignItems: 'center',
            justifyContent: 'center',
            gap: theme.spacing.sm,
            overflow: 'hidden',
            backgroundColor: theme.colors.surface,
          }}
        >
          {uploading ? (
            <ActivityIndicator color={theme.colors.brand} />
          ) : photo ? (
            <Image
              source={{ uri: photo.uri }}
              accessibilityIgnoresInvertColors
              style={{ width: '100%', height: 180 }}
            />
          ) : (
            <>
              <ImagePlus size={28} color={theme.colors.brandText} />
              <AppText weight="semibold" color="brandText">
                {t('tax.certificatePick')}
              </AppText>
            </>
          )}
        </Pressable>
      </ScrollView>

      <Footer>
        <View style={{ paddingBottom: insets.bottom }}>
          <Button
            icon={Check}
            title={t('tax.certificateSubmit')}
            disabled={!photo}
            loading={submitting}
            onPress={() => void submit()}
          />
        </View>
      </Footer>
    </View>
  );
}
