import { router } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { AppText } from '../AppText';

interface StepHeaderProps {
  /** 1-based step of the 5-step sign-up (K2 … K4). Without it only the back arrow shows. */
  step?: number;
  total?: number;
  /** K3d shows the current step in red. */
  failed?: boolean;
  onBack?: () => void;
  hideBack?: boolean;
}

/** Back arrow, segmented progress and "n/5" (K2–K4). */
export function StepHeader({ step, total = 5, failed, onBack, hideBack }: StepHeaderProps) {
  const theme = useTheme();
  const { t } = useTranslation();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        minHeight: theme.size.headerBar,
      }}
    >
      {hideBack ? (
        <View style={{ width: theme.size.touchTarget }} />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={onBack ?? (() => (router.canGoBack() ? router.back() : undefined))}
          style={{
            width: theme.size.touchTarget,
            height: theme.size.touchTarget,
            justifyContent: 'center',
          }}
        >
          <ArrowLeft size={28} color={theme.colors.text} />
        </Pressable>
      )}
      {step === undefined ? null : (
        <>
          <View
            style={{ flex: 1, flexDirection: 'row', gap: theme.spacing.sm }}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: total, now: step }}
          >
            {Array.from({ length: total }, (_, index) => (
              <View
                key={index}
                style={{
                  flex: 1,
                  height: 5,
                  borderRadius: 3,
                  backgroundColor:
                    index < step - 1 || (index === step - 1 && !failed)
                      ? theme.colors.brand
                      : index === step - 1
                        ? theme.colors.red
                        : theme.colors.sep,
                }}
              />
            ))}
          </View>
          <AppText weight="bold" color="text2">
            {step}/{total}
          </AppText>
        </>
      )}
    </View>
  );
}
