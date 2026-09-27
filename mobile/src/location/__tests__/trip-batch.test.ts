import {
  MAX_TRIP_POINTS,
  type RawLocationSample,
  shouldStopTracking,
  toTripPoints,
} from '../trip-batch';

const sample = (timestamp: number, overrides: Partial<RawLocationSample['coords']> = {}) => ({
  coords: { latitude: 41.3, longitude: 69.2, accuracy: 5, speed: 3, heading: 90, ...overrides },
  timestamp,
});

describe('toTripPoints (stage 6 background location batching)', () => {
  it('maps coordinates and timestamps to the API shape', () => {
    const [point] = toTripPoints([sample(1_700_000_000_000)]);
    expect(point).toEqual({
      lat: 41.3,
      lng: 69.2,
      at: new Date(1_700_000_000_000).toISOString(),
      accuracy_m: 5,
      speed: 3,
      heading: 90,
    });
  });

  it('sorts out-of-order samples by time', () => {
    const points = toTripPoints([sample(3_000), sample(1_000), sample(2_000)]);
    expect(points.map((p) => p.at)).toEqual([
      new Date(1_000).toISOString(),
      new Date(2_000).toISOString(),
      new Date(3_000).toISOString(),
    ]);
  });

  it('caps a batch at 50 points, keeping the most recent', () => {
    const samples = Array.from({ length: 60 }, (_, i) => sample(i * 1_000));
    const points = toTripPoints(samples);
    expect(points).toHaveLength(MAX_TRIP_POINTS);
    expect(points[0]?.at).toBe(new Date(10_000).toISOString());
    expect(points.at(-1)?.at).toBe(new Date(59_000).toISOString());
  });

  it('drops unknown speed and heading (-1 or missing) but keeps zero', () => {
    const [point] = toTripPoints([
      sample(1_000, { speed: -1, heading: null, accuracy: undefined }),
    ]);
    expect(point).toMatchObject({ speed: undefined, heading: undefined, accuracy_m: undefined });

    const [still] = toTripPoints([sample(1_000, { speed: 0, heading: 0 })]);
    expect(still).toMatchObject({ speed: 0, heading: 0 });
  });

  it('returns an empty batch for no samples', () => {
    expect(toTripPoints([])).toEqual([]);
  });
});

describe('shouldStopTracking', () => {
  it('stops once the server reports the trip is no longer active', () => {
    expect(shouldStopTracking({ active: false })).toBe(true);
    expect(shouldStopTracking({ active: true })).toBe(false);
  });
});
