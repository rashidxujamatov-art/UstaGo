import { decodePolyline } from './polyline.js';

describe('decodePolyline (Google Routes API polyline, precision 5)', () => {
  it("decodes Google's own documented example", () => {
    // https://developers.google.com/maps/documentation/utilities/polylinealgorithm
    const points = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(points).toHaveLength(3);
    expect(points[0]).toEqual({ lat: 38.5, lng: -120.2 });
    expect(points[1]).toEqual({ lat: 40.7, lng: -120.95 });
    expect(points[2]).toEqual({ lat: 43.252, lng: -126.453 });
  });

  it('decodes an empty string as no points', () => {
    expect(decodePolyline('')).toEqual([]);
  });
});
