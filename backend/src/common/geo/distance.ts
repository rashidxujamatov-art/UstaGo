/**
 * Plain lat/lng geometry shared by the maps and trips modules (docs/01 §10): the mock
 * route, the auto-stop check and the "off the route" deviation check all need a distance
 * in meters, not a database round trip.
 */
export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance (meters) between two points. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Flat local projection (meters east/north of `origin`); accurate over a few kilometers. */
function toLocalMeters(origin: LatLng, point: LatLng): { x: number; y: number } {
  return {
    x: toRad(point.lng - origin.lng) * EARTH_RADIUS_M * Math.cos(toRad(origin.lat)),
    y: toRad(point.lat - origin.lat) * EARTH_RADIUS_M,
  };
}

function distanceToSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  const t =
    len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2));
  return Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby));
}

/**
 * Shortest distance (meters) from `point` to the polyline (§10: "off the polyline if
 * present"). A single-point polyline is treated as a plain distance to that point.
 */
export function distanceToPolylineMeters(point: LatLng, polyline: readonly LatLng[]): number {
  if (polyline.length === 0) return Number.POSITIVE_INFINITY;
  if (polyline.length === 1) return haversineMeters(point, polyline[0]!);
  const origin = polyline[0]!;
  const p = toLocalMeters(origin, point);
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < polyline.length - 1; i++) {
    const a = toLocalMeters(origin, polyline[i]!);
    const b = toLocalMeters(origin, polyline[i + 1]!);
    best = Math.min(best, distanceToSegment(p, a, b));
  }
  return best;
}
