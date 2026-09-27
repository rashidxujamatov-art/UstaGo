import type { LatLng } from '../../common/geo/distance.js';
import type { Language } from '../../generated/prisma/client.js';

export interface PlaceSuggestion {
  place_id: string;
  primary: string;
  secondary: string;
}

export interface PlaceLocation {
  lat: number;
  lng: number;
  address: string;
}

export interface RouteResult {
  durationSec: number;
  distanceM: number;
  /** The route's shape, when the provider returns one (§10: used to detect a deviation). */
  polyline?: LatLng[];
}

/**
 * Google Maps Platform proxy (docs/01-biznes-qoidalar.md §10): Geocoding, Places and
 * Routes run on the server only, the app holds just the Maps SDK key.
 */
export interface MapsProvider {
  reverseGeocode(lat: number, lng: number, language: Language): Promise<string | null>;
  autocomplete(
    query: string,
    language: Language,
    sessionToken: string,
    near?: { lat: number; lng: number },
  ): Promise<PlaceSuggestion[]>;
  place(placeId: string, language: Language, sessionToken: string): Promise<PlaceLocation | null>;
  /** ETA and distance for the live-location trip (§10); null when the provider has no route. */
  route(origin: LatLng, destination: LatLng): Promise<RouteResult | null>;
}

export const MAPS_PROVIDER = Symbol('MAPS_PROVIDER');
