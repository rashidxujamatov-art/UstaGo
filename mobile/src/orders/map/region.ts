import type { Coords } from '../../api/queries';

export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

const FALLBACK: MapRegion = {
  latitude: 41.3111,
  longitude: 69.2797,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

/** Street-level zoom when the two points nearly coincide (BJ12 right after arriving). */
const MIN_DELTA = 0.006;

/** Region that fits every point with a margin, for the BJ12/BY7 live map (TripMap). */
export function regionFor(points: readonly Coords[], padding = 1.8): MapRegion {
  if (points.length === 0) return FALLBACK;
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * padding, MIN_DELTA),
    longitudeDelta: Math.max((maxLng - minLng) * padding, MIN_DELTA),
  };
}
