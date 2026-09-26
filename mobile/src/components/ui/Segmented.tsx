import type { LucideIcon } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { AppText } from '../AppText';

interface Option<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

interface SegmentedProps<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
}

/** Pill switch: Kunduzgi/Tungi/Avto, Ro‘yxatdan o‘tish/Kirish, ID-karta/Pasport. */
export function Segmented<T extends string>({ options, value, onChange }: SegmentedProps<T>) {
  const theme = useTheme();

  return (
    <View
      accessibilityRole="radiogroup"
      style={{
        flexDirection: 'row',
        padding: 4,
        borderRadius: theme.radius.card,
        backgroundColor: theme.colors.surface2,
      }}
    >
      {options.map(({ value: option, label, icon: Icon }) => {
        const selected = option === value;
        const color = selected ? theme.colors.text : theme.colors.text2;
        return (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(option)}
            style={{
              flex: 1,
              minHeight: theme.size.touchTarget + 4,
              flexDirection: 'row',
              gap: theme.spacing.sm,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: theme.radius.md,
              backgroundColor: selected ? theme.colors.bg : 'transparent',
            }}
          >
            {Icon ? <Icon size={20} color={color} /> : null}
            <AppText weight={selected ? 'bold' : 'medium'} size="bodyLarge" style={{ color }}>
              {label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
