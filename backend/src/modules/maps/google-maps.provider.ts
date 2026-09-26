import type { Language } from '../../generated/prisma/client.js';
import type { MapsProvider, PlaceLocation, PlaceSuggestion } from './maps.provider.js';

type UsageRecorder = (kind: 'geocode' | 'autocomplete' | 'place') => Promise<void>;

/** Google Geocoding API and Places API (New). Every request is recorded for SA6. */
export class GoogleMapsProvider implements MapsProvider {
  constructor(
    private readonly apiKey: string,
    private readonly recordUsage: UsageRecorder,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async reverseGeocode(lat: number, lng: number, language: Language): Promise<string | null> {
    await this.recordUsage('geocode');
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.search = new URLSearchParams({
      latlng: `${lat},${lng}`,
      language,
      key: this.apiKey,
    }).toString();
    const body = (await this.json(
      await this.fetchFn(url, { signal: AbortSignal.timeout(8_000) }),
    )) as {
      status: string;
      results?: { formatted_address: string }[];
    };
    if (body.status === 'ZERO_RESULTS') return null;
    if (body.status !== 'OK') throw new Error(`Google geocoding failed: ${body.status}`);
    return body.results?.[0]?.formatted_address ?? null;
  }

  async autocomplete(
    query: string,
    language: Language,
    sessionToken: string,
    near?: { lat: number; lng: number },
  ): Promise<PlaceSuggestion[]> {
    await this.recordUsage('autocomplete');
    const response = await this.fetchFn('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': this.apiKey },
      body: JSON.stringify({
        input: query,
        languageCode: language,
        sessionToken,
        includedRegionCodes: ['uz'],
        ...(near
          ? {
              locationBias: {
                circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 30_000 },
              },
            }
          : {}),
      }),
      signal: AbortSignal.timeout(8_000),
    });
    const body = (await this.json(response)) as {
      suggestions?: {
        placePrediction?: {
          placeId: string;
          structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } };
          text?: { text: string };
        };
      }[];
    };
    return (body.suggestions ?? []).flatMap(({ placePrediction: p }) =>
      p
        ? [
            {
              place_id: p.placeId,
              primary: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
              secondary: p.structuredFormat?.secondaryText?.text ?? '',
            },
          ]
        : [],
    );
  }

  async place(
    placeId: string,
    language: Language,
    sessionToken: string,
  ): Promise<PlaceLocation | null> {
    await this.recordUsage('place');
    const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`);
    url.search = new URLSearchParams({ languageCode: language, sessionToken }).toString();
    const response = await this.fetchFn(url, {
      headers: { 'X-Goog-Api-Key': this.apiKey, 'X-Goog-FieldMask': 'location,formattedAddress' },
      signal: AbortSignal.timeout(8_000),
    });
    if (response.status === 404) return null;
    const body = (await this.json(response)) as {
      location?: { latitude: number; longitude: number };
      formattedAddress?: string;
    };
    if (!body.location) return null;
    return {
      lat: body.location.latitude,
      lng: body.location.longitude,
      address: body.formattedAddress ?? '',
    };
  }

  private async json(response: Response): Promise<unknown> {
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Google Maps API HTTP ${response.status}: ${text.slice(0, 200)}`);
    }
    return response.json();
  }
}
