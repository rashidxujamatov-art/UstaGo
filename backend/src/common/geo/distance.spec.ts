import { distanceToPolylineMeters, haversineMeters } from './distance.js';

describe('geo distance (docs/01 §10: auto-stop and route-deviation checks)', () => {
  it('measures the great-circle distance between two points', () => {
    // Chilonzor 9-kvartal ↔ Amir Temur xiyoboni, roughly 6-7 km apart.
    const a = { lat: 41.2856, lng: 69.2034 };
    const b = { lat: 41.3111, lng: 69.2797 };
    const d = haversineMeters(a, b);
    expect(d).toBeGreaterThan(6_000);
    expect(d).toBeLessThan(7_000);
  });

  it('is zero for the same point', () => {
    const p = { lat: 41.3, lng: 69.25 };
    expect(haversineMeters(p, p)).toBeCloseTo(0, 6);
  });

  it('measures the distance to the nearest segment of a polyline', () => {
    // A straight route from (0,0) to (0, 0.01) roughly north; a point 0.001° east of the
    // midpoint sits off to the side, not off either endpoint.
    const polyline = [
      { lat: 0, lng: 0 },
      { lat: 0.01, lng: 0 },
    ];
    const midOffset = distanceToPolylineMeters({ lat: 0.005, lng: 0.001 }, polyline);
    const nearMid = distanceToPolylineMeters({ lat: 0.005, lng: 0 }, polyline);
    expect(midOffset).toBeGreaterThan(nearMid);
    expect(nearMid).toBeLessThan(5); // essentially on the line
  });

  it('clamps to the nearest endpoint beyond the segment', () => {
    const polyline = [
      { lat: 0, lng: 0 },
      { lat: 0.01, lng: 0 },
    ];
    // Far past the second point along the same bearing.
    const beyond = distanceToPolylineMeters({ lat: 0.02, lng: 0 }, polyline);
    const toEndpoint = haversineMeters({ lat: 0.02, lng: 0 }, polyline[1]!);
    expect(beyond).toBeCloseTo(toEndpoint, 0);
  });

  it('falls back to a plain distance for a single-point polyline', () => {
    const point = { lat: 1, lng: 1 };
    const single = [{ lat: 0, lng: 0 }];
    expect(distanceToPolylineMeters(point, single)).toBeCloseTo(
      haversineMeters(point, single[0]!),
      3,
    );
  });
});
