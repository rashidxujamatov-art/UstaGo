import { Flag, MapPin } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import type { DisputeTrackPoint } from '../api/types';
import { regionFor } from '../orders/map/region';
import { mapStyle } from '../orders/map/map-style';
import { useTheme } from '../theme/ThemeProvider';

export interface DisputeTrackMapProps {
  points: DisputeTrackPoint[];
}

/**
 * AD3 "Yo'l xaritasi": the full saved route of one trip, read-only (stage7-contract §4
 * `GET /admin/disputes/:orderId/track`, audited on every read). Unlike the live `TripMap`
 * (destination + one moving marker), this draws every stored point as a static polyline.
 */
export function DisputeTrackMap({ points }: DisputeTrackMapProps) {
  const theme = useTheme();
  const coords = points.map((point) => ({ lat: point.lat, lng: point.lng }));
  const region = regionFor(coords);
  const first = points[0];
  const last = points.at(-1);

  return (
    <MapView
      provider={PROVIDER_GOOGLE}
      style={StyleSheet.absoluteFill}
      initialRegion={region}
      customMapStyle={mapStyle(theme)}
      showsMyLocationButton={false}
      toolbarEnabled={false}
      scrollEnabled
      zoomEnabled
      rotateEnabled={false}
      pitchEnabled={false}
    >
      {points.length > 1 ? (
        <Polyline
          coordinates={points.map((point) => ({ latitude: point.lat, longitude: point.lng }))}
          strokeColor={theme.colors.brand}
          strokeWidth={4}
        />
      ) : null}
      {first ? (
        <Marker coordinate={{ latitude: first.lat, longitude: first.lng }}>
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.green,
            }}
          >
            <MapPin size={16} color={theme.colors.bg} />
          </View>
        </Marker>
      ) : null}
      {last && last !== first ? (
        <Marker
          coordinate={{ latitude: last.lat, longitude: last.lng }}
          pinColor={theme.colors.destinationPin}
        >
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.destinationPin,
            }}
          >
            <Flag size={16} color={theme.colors.bg} />
          </View>
        </Marker>
      ) : null}
    </MapView>
  );
}
