import { CircleCheck, ImagePlus, X } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, View } from 'react-native';
import { useConfig } from '../api/queries';
import { AppText } from '../components/AppText';
import { BottomSheet } from '../components/ui/BottomSheet';
import { Button } from '../components/ui/Button';
import { pickAndUploadPhoto, type UploadedPhoto } from '../lib/upload';
import { useTheme } from '../theme/ThemeProvider';
import { showNotice } from '../lib/notice';

interface FinishSheetProps {
  visible: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: (photoKeys: string[]) => void;
}

/** "Ishni tugatdim" with optional photos of the finished work. */
export function FinishSheet({ visible, busy, onClose, onConfirm }: FinishSheetProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const config = useConfig();
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const max = config.data?.order_photos_max ?? 0;

  const add = async () => {
    setUploading(true);
    try {
      const photo = await pickAndUploadPhoto('FINISH_PHOTO');
      if (photo) setPhotos((list) => [...list, photo]);
    } catch {
      showNotice(t('newOrder.photoFailed'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      footer={
        <Button
          title={t('job.finish')}
          icon={CircleCheck}
          loading={busy}
          disabled={uploading}
          onPress={() => onConfirm(photos.map((photo) => photo.key))}
        />
      }
    >
      <AppText size="title" weight="bold" accessibilityRole="header">
        {t('job.finishTitle')}
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md }}>
        {photos.map((photo) => (
          <View key={photo.key}>
            <Image
              source={{ uri: photo.uri }}
              accessibilityIgnoresInvertColors
              style={{ width: 72, height: 72, borderRadius: theme.radius.md }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('newOrder.removePhoto')}
              hitSlop={12}
              onPress={() => setPhotos((list) => list.filter((item) => item.key !== photo.key))}
              style={{
                position: 'absolute',
                top: -8,
                right: -8,
                width: 26,
                height: 26,
                borderRadius: 13,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.text,
              }}
            >
              <X size={16} color={theme.colors.bg} />
            </Pressable>
          </View>
        ))}
      </View>
      {photos.length < max ? (
        <Button
          variant="secondary"
          icon={uploading ? undefined : ImagePlus}
          title={t('job.finishPhoto')}
          loading={uploading}
          onPress={() => void add()}
        />
      ) : null}
    </BottomSheet>
  );
}
