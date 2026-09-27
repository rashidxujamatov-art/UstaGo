import type { TripPointInput } from '../api/types';

/**
 * A raw sample from `expo-location`. Kept as a small structural type (not `Location.LocationObject`
 * itself) so this file stays a plain module with no native dependency and can run under Jest.
 */
export interface RawLocationSample {
  coords: {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
    speed?: number | null;
    heading?: number | null;
  };
  timestamp: number;
}

/** The backend accepts 1..50 points per call (stage 6 contract). */
export const MAX_TRIP_POINTS = 50;

/** iOS/Android report -1 for "unknown" speed/heading; the API expects them omitted, not -1. */
function known(value: number | null | undefined): number | undefined {
  return value === null || value === undefined || value < 0 ? undefined : value;
}

/**
 * Turns the samples the background location task collected since the last run into the batch
 * `POST /orders/:id/trip/points` expects: sorted by `at`, capped at {@link MAX_TRIP_POINTS}
 * (keeping the most recent ones), invalid speed/heading dropped.
 */
export function toTripPoints(samples: readonly RawLocationSample[]): TripPointInput[] {
  return samples
    .map((sample): TripPointInput => ({
      lat: sample.coords.latitude,
      lng: sample.coords.longitude,
      at: new Date(sample.timestamp).toISOString(),
      accuracy_m: known(sample.coords.accuracy),
      speed: known(sample.coords.speed),
      heading: known(sample.coords.heading),
    }))
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(-MAX_TRIP_POINTS);
}

/** The server tells the app to stop the background task once the trip is no longer active. */
export function shouldStopTracking(response: { active: boolean }): boolean {
  return !response.active;
}
