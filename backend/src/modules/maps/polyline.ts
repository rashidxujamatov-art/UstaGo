import type { LatLng } from '../../common/geo/distance.js';

/** Decodes a Google encoded polyline (precision 5), as returned by the Routes API. */
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    lat += decodeValue();
    lng += decodeValue();
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;

  /** One coordinate delta of the varint + zigzag encoding, advancing `index`. */
  function decodeValue(): number {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  }
}
