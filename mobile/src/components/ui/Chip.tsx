import type { LucideIcon } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import type { ColorToken } from '../../theme/tokens';
import { AppText } from '../AppText';

interface ChipProps {
  label: string;
  selected?: boolean;
  icon?: LucideIcon;
  onPress: () => void;
}

/** Selectable pill: categories and payment methods (BY2), feed filters (BJ1). */
export function Chip({ label, selected = false, icon: Icon, onPress }: ChipProps) {
  const theme = useTheme();
  const color = selected ? theme.colors.barText : theme.colors.text;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: theme.size.touchTarget,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.lg + 2,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: selected ? theme.colors.brand : theme.colors.sep,
        backgroundColor: selected ? theme.colors.brand : theme.colors.bg,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {Icon ? <Icon size={20} color={color} /> : null}
      <AppText size="bodyLarge" weight={selected ? 'bold' : 'medium'} style={{ color }}>
        {label}
      </AppText>
    </Pressable>
  );
}

export type TagTone = 'neutral' | 'brand' | 'green' | 'orange' | 'red';

const TONES: Record<TagTone, { bg: ColorToken; fg: ColorToken }> = {
  neutral: { bg: 'surface2', fg: 'text' },
  brand: { bg: 'brandSoft', fg: 'brandText' },
  green: { bg: 'greenSoft', fg: 'green' },
  orange: { bg: 'orangeSoft', fg: 'orange' },
  red: { bg: 'redSoft', fg: 'red' },
};

interface TagProps {
  label: string;
  tone?: TagTone;
  icon?: LucideIcon;
  /** Icon color when it differs from the text (category tag on BJ2). */
  iconColor?: string;
}

/** Small read-only pill: payment type, "Yangi", category (BJ1, BJ2). */
export function Tag({ label, tone = 'neutral', icon: Icon, iconColor }: TagProps) {
  const theme = useTheme();
  const { bg, fg } = TONES[tone];
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 6,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: theme.colors[bg],
      }}
    >
      {Icon ? <Icon size={16} color={iconColor ?? theme.colors[fg]} /> : null}
      <AppText weight="semibold" color={fg}>
        {label}
      </AppText>
    </View>
  );
}
