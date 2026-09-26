import { Wrench } from 'lucide-react-native';
import { View } from 'react-native';
import type { Category } from '../api/types';
import { CATEGORY_ICONS } from '../lib/categories';
import { brandMark } from '../theme/tokens';

interface CategoryIconProps {
  category: Pick<Category, 'icon' | 'color'>;
  size?: number;
  /** Rounded square (BJ1) instead of a circle (BY1). */
  square?: boolean;
}

/** White category glyph on the category's own color (BY1, BY2, BJ1). */
export function CategoryIcon({ category, size = 56, square = false }: CategoryIconProps) {
  const Icon = CATEGORY_ICONS[category.icon] ?? Wrench;
  return (
    <View
      accessible={false}
      style={{
        width: size,
        height: size,
        borderRadius: square ? size * 0.27 : size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: category.color,
      }}
    >
      {/* White in both modes, like the brand glyph. */}
      <Icon size={size * 0.46} color={brandMark.glyphColor} />
    </View>
  );
}
