import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';
import { brandMark } from '../theme/tokens';

interface BrandMarkProps {
  /** Tile size; 76 on the language screen, 30 in the middle of the BJ4 payment QR. */
  size?: number;
  radius?: number;
}

/** App icon: white "G" with an arrow on a `brand` tile (docs/03-ekranlar-va-dizayn.md §2.4). */
export function BrandMark({ size = brandMark.size, radius = brandMark.radius }: BrandMarkProps) {
  const theme = useTheme();
  const glyph = Math.round(size * 0.55);

  return (
    <View
      accessible={false}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: theme.colors.brand,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Svg
        width={glyph}
        height={glyph}
        viewBox={`0 0 ${brandMark.viewBox} ${brandMark.viewBox}`}
        fill="none"
        stroke={brandMark.glyphColor}
        strokeWidth={brandMark.strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {brandMark.paths.map((d) => (
          <Path key={d} d={d} />
        ))}
      </Svg>
    </View>
  );
}
