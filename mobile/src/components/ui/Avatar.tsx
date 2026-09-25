import { View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { AppText } from '../AppText';

interface AvatarProps {
  initials: string;
  size?: number;
  /** Adds a ring, as in the U1 header. */
  ring?: boolean;
}

/** Initials in a `brand` circle (K2 inviter, U1 profile). */
export function Avatar({ initials, size = 56, ring = false }: AvatarProps) {
  const theme = useTheme();
  return (
    <View
      accessible={false}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: theme.colors.brand,
        borderWidth: ring ? 4 : 0,
        borderColor: theme.colors.pillText,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <AppText weight="bold" style={{ color: theme.colors.barText, fontSize: size * 0.36 }}>
        {initials}
      </AppText>
    </View>
  );
}
