import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import type { Coords } from '../api/queries';

export type LocationPermission = 'unknown' | 'granted' | 'denied';

/** About 100 m: enough for "1.2 km" and keeps the feed query stable while standing still. */
const round = (value: number) => Math.round(value * 1000) / 1000;

export async function currentCoords(): Promise<Coords | null> {
  const position =
    (await Location.getLastKnownPositionAsync()) ??
    (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
  return position ? { lat: position.coords.latitude, lng: position.coords.longitude } : null;
}

/**
 * Foreground location for distances on BJ1. Asks only when `request` is called (the user
 * taps "5 km gacha" or the hint); a permission given earlier is used silently.
 */
export function useDeviceLocation() {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [permission, setPermission] = useState<LocationPermission>('unknown');

  const locate = useCallback(async () => {
    try {
      const found = await currentCoords();
      if (found) setCoords({ lat: round(found.lat), lng: round(found.lng) });
    } catch {
      // Location services off: the feed works without distances.
    }
  }, []);

  useEffect(() => {
    let alive = true;
    Location.getForegroundPermissionsAsync()
      .then((result) => {
        if (!alive) return;
        if (result.granted) {
          setPermission('granted');
          void locate();
        } else if (!result.canAskAgain) {
          setPermission('denied');
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [locate]);

  const request = useCallback(async (): Promise<boolean> => {
    const result = await Location.requestForegroundPermissionsAsync();
    setPermission(result.granted ? 'granted' : 'denied');
    if (result.granted) await locate();
    return result.granted;
  }, [locate]);

  return { coords, permission, request };
}
