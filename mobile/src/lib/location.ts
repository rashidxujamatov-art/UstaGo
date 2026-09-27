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

/**
 * BJ11 "Ha, yo'lga chiqdim": foreground first, then background (Android 11+ requires the
 * two-step request). Sharing is optional (docs/01 §10): a decline just depart with
 * `share_location: false`, it never blocks the job.
 */
export async function requestShareLocationPermissions(): Promise<boolean> {
  try {
    const foreground = await Location.requestForegroundPermissionsAsync();
    if (!foreground.granted) return false;
    const background = await Location.requestBackgroundPermissionsAsync();
    return background.granted;
  } catch {
    return false;
  }
}

export interface LivePosition {
  lat: number;
  lng: number;
  heading: number | null;
}

/**
 * The pro's own position for BJ12's map, watched in the foreground while the screen is open.
 * Separate from the background task (`src/location/trip-task.ts`), which keeps posting to the
 * server whether or not this screen is on top.
 */
export function useLiveDeviceLocation(active: boolean): LivePosition | null {
  const [position, setPosition] = useState<LivePosition | null>(null);

  useEffect(() => {
    if (!active) return undefined;
    let alive = true;
    let subscription: Location.LocationSubscription | null = null;
    Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 5 },
      (update) => {
        if (!alive) return;
        setPosition({
          lat: update.coords.latitude,
          lng: update.coords.longitude,
          heading: update.coords.heading ?? null,
        });
      },
    )
      .then((sub) => {
        if (alive) subscription = sub;
        else sub.remove();
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      subscription?.remove();
    };
  }, [active]);

  // Stale while inactive rather than resetting state from inside the effect (react-hooks/set-state-in-effect).
  return active ? position : null;
}
