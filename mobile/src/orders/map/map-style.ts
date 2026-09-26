import type { Theme } from '../../theme/ThemeProvider';
import { mapColors } from '../../theme/tokens';

interface MapStyleRule {
  featureType?: string;
  elementType?: string;
  stylers: Record<string, string>[];
}

/** Google Maps colors from docs/03 §2.1, laid over the provider's own style. */
export function mapStyle(theme: Theme): MapStyleRule[] {
  if (theme.scheme === 'light') {
    const { road, building, park } = mapColors.light;
    return [
      { featureType: 'road', elementType: 'geometry', stylers: [{ color: road }] },
      {
        featureType: 'landscape.man_made',
        elementType: 'geometry',
        stylers: [{ color: building }],
      },
      { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: park }] },
    ];
  }
  const { road, building } = mapColors.dark;
  return [
    { elementType: 'geometry', stylers: [{ color: building }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: road }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: theme.colors.wall }] },
    { elementType: 'labels.text.fill', stylers: [{ color: theme.colors.text2 }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: theme.colors.bg2 }] },
  ];
}
