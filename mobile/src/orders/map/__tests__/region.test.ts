import { regionFor } from '../region';

describe('regionFor (BJ12/BY7 live map framing)', () => {
  it('falls back to central Tashkent with no points', () => {
    expect(regionFor([])).toEqual({
      latitude: 41.3111,
      longitude: 69.2797,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    });
  });

  it('centers on a single point with a minimum zoom', () => {
    const region = regionFor([{ lat: 41.3, lng: 69.28 }]);
    expect(region.latitude).toBe(41.3);
    expect(region.longitude).toBe(69.28);
    expect(region.latitudeDelta).toBeGreaterThan(0);
  });

  it('fits both points with a margin', () => {
    const region = regionFor([
      { lat: 41.3, lng: 69.28 },
      { lat: 41.31, lng: 69.29 },
    ]);
    expect(region.latitude).toBeCloseTo(41.305);
    expect(region.longitude).toBeCloseTo(69.285);
    expect(region.latitudeDelta).toBeCloseTo(0.01 * 1.8, 5);
  });

  it('never returns a delta below the street-level minimum', () => {
    const region = regionFor([
      { lat: 41.3, lng: 69.28 },
      { lat: 41.3, lng: 69.28 },
    ]);
    expect(region.latitudeDelta).toBeGreaterThanOrEqual(0.006);
    expect(region.longitudeDelta).toBeGreaterThanOrEqual(0.006);
  });
});
