import type { MapsProvider, PlaceLocation, PlaceSuggestion } from './maps.provider.js';

const PLACES: (PlaceLocation & { id: string })[] = [
  {
    id: 'mock-chilonzor-9',
    lat: 41.2856,
    lng: 69.2034,
    address: 'Chilonzor tumani, 9-kvartal, 14-uy',
  },
  {
    id: 'mock-yunusobod-4',
    lat: 41.3634,
    lng: 69.2869,
    address: 'Yunusobod tumani, 4-kvartal, 7-uy',
  },
  {
    id: 'mock-mirzo-ulugbek',
    lat: 41.3264,
    lng: 69.3346,
    address: 'Mirzo Ulug‘bek tumani, Buyuk Ipak yo‘li, 32',
  },
  { id: 'mock-amir-temur', lat: 41.3111, lng: 69.2797, address: 'Amir Temur xiyoboni, 1' },
];

/** Local/test stand-in: a few fixed Tashkent addresses, no network, no billing. */
export class MockMapsProvider implements MapsProvider {
  reverseGeocode(lat: number, lng: number): Promise<string | null> {
    const nearest = [...PLACES].sort(
      (a, b) => (a.lat - lat) ** 2 + (a.lng - lng) ** 2 - ((b.lat - lat) ** 2 + (b.lng - lng) ** 2),
    )[0];
    return Promise.resolve(nearest?.address ?? null);
  }

  autocomplete(query: string): Promise<PlaceSuggestion[]> {
    const needle = query.trim().toLowerCase();
    return Promise.resolve(
      PLACES.filter((place) => place.address.toLowerCase().includes(needle)).map((place) => {
        const [primary = '', ...rest] = place.address.split(', ');
        return { place_id: place.id, primary, secondary: rest.join(', ') };
      }),
    );
  }

  place(placeId: string): Promise<PlaceLocation | null> {
    const found = PLACES.find((place) => place.id === placeId);
    return Promise.resolve(
      found ? { lat: found.lat, lng: found.lng, address: found.address } : null,
    );
  }
}
