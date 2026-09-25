import { Text, type TextProps } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import type { ColorToken, FontSizeName, FontWeightName } from '../theme/tokens';

export interface AppTextProps extends TextProps {
  size?: FontSizeName;
  weight?: FontWeightName;
  color?: ColorToken;
}

/** Text with the design font, theme color and the "large text" scale applied. */
export function AppText({
  size = 'body',
  weight = 'regular',
  color = 'text',
  style,
  ...props
}: AppTextProps) {
  const theme = useTheme();
  return (
    <Text
      {...props}
      style={[
        {
          fontFamily: theme.fontFamily[weight],
          fontSize: theme.fontSize[size],
          color: theme.colors[color],
        },
        style,
      ]}
    />
  );
}
