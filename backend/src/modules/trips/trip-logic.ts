import {
  distanceToPolylineMeters,
  haversineMeters,
  type LatLng,
} from '../../common/geo/distance.js';

/** Auto stop (docs/01 §10): within `auto_stop_radius_m` of the destination. */
export function isNearDestination(distanceM: number, autoStopRadiusM: number): boolean {
  return distanceM <= autoStopRadiusM;
}

export interface LastRoute {
  lastRouteAt: Date | null;
  /** The last computed route's shape, or null when the provider gave none (the mock always has one). */
  polyline: readonly LatLng[] | null;
  /** The point the last ETA was computed from, used when there is no polyline. */
  origin: LatLng | null;
}

/** How far `point` is from the last computed route (§10: "off the polyline if present, else from the point the last ETA was computed"). Infinity when there is nothing to compare against yet. */
export function deviationMeters(point: LatLng, last: LastRoute): number {
  if (last.polyline && last.polyline.length > 0)
    return distanceToPolylineMeters(point, last.polyline);
  if (last.origin) return haversineMeters(point, last.origin);
  return Number.POSITIVE_INFINITY;
}

export interface RecomputeInput {
  lastRouteAt: Date | null;
  now: Date;
  etaRefreshSec: number;
  deviationM: number;
  routeDeviationM: number;
}

/**
 * Whether the ETA should be recomputed now (§10): never computed yet, `eta_refresh_sec`
 * elapsed since the last computation, or the pro strayed more than `route_deviation_m`
 * off the last route. Throttles Google Routes calls (SA6 tracks their cost).
 */
export function shouldRecomputeRoute(input: RecomputeInput): boolean {
  if (!input.lastRouteAt) return true;
  const elapsedSec = (input.now.getTime() - input.lastRouteAt.getTime()) / 1000;
  if (elapsedSec >= input.etaRefreshSec) return true;
  return input.deviationM > input.routeDeviationM;
}

/**
 * The most recent of a batch of points sent together, by their own `at` timestamp — not
 * necessarily the last array element (the contract asks the app to sort them, but the
 * server does not trust that blindly).
 */
export function latestPoint<T extends { at: string }>(points: readonly T[]): T {
  return points.reduce((latest, point) =>
    new Date(point.at).getTime() > new Date(latest.at).getTime() ? point : latest,
  );
}
