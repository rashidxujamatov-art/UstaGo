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

/**
 * Google Maps Platform proxy (docs/01-biznes-qoidalar.md §10): Geocoding and Places run
 * on the server only, the app holds just the Maps SDK key.
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
}

export const MAPS_PROVIDER = Symbol('MAPS_PROVIDER');
