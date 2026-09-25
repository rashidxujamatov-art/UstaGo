import type { LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, Pressable, type StyleProp, View, type ViewStyle } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { AppText } from '../AppText';

type Variant = 'primary' | 'secondary' | 'link';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: Variant;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Primary (56 px), secondary (48 px) and text-link buttons (docs/03 §2.2). */
export function Button({
  title,
  onPress,
  variant = 'primary',
  icon: Icon,
  iconRight: IconRight,
  loading = false,
  disabled = false,
  style,
}: ButtonProps) {
  const theme = useTheme();
  const inactive = disabled || loading;
  const color = variant === 'primary' ? theme.colors.barText : theme.colors.brandText;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: variant === 'primary' ? theme.size.buttonPrimary : theme.size.buttonSecondary,
          borderRadius: theme.radius.lg,
          paddingHorizontal: theme.spacing.lg,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor:
            variant === 'primary'
              ? theme.colors.brand
              : variant === 'secondary'
                ? theme.colors.brandSoft
                : 'transparent',
          opacity: inactive && !loading ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          {Icon ? <Icon size={22} color={color} /> : null}
          <AppText
            weight={variant === 'link' ? 'semibold' : 'bold'}
            size={variant === 'primary' ? 'bodyLarge' : 'body'}
            style={{ color, textAlign: 'center' }}
          >
            {title}
          </AppText>
          {IconRight ? <IconRight size={22} color={color} /> : null}
        </View>
      )}
    </Pressable>
  );
}
