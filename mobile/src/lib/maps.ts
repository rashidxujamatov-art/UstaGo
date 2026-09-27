import { Linking } from 'react-native';

/**
 * Route to a point in the Google Maps app (or the website when it is not installed).
 * Turn-by-turn navigation inside our app is not allowed by Google's terms (CLAUDE.md rule 8).
 */
export function googleMapsDirectionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
}

export function openDirections(lat: number, lng: number): void {
  void Linking.openURL(googleMapsDirectionsUrl(lat, lng));
}

export function callPhone(phone: string): void {
  void Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`);
}
