import { Navigation2 } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import type { Coords } from '../../api/queries';
import { useTheme } from '../../theme/ThemeProvider';
import { mapStyle } from './map-style';
import { regionFor } from './region';

export interface TripMapProps {
  destination: Coords;
  /** The pro's live position; null while not sharing (BJ12) or before the first fix (BY7). */
  position: (Coords & { heading?: number | null }) | null;
}

/**
 * BJ12/BY7 live map: the destination pin, the pro's marker and a straight line between them.
 * No route geometry is exposed to the client (Routes stays server-side, docs/02 §9), so the
 * line is a stand-in for the real route — same spirit as the design's stylised map art.
 * The web preview has a stand-in (.web.tsx), same as the BY6 address map.
 */
export function TripMap({ destination, position }: TripMapProps) {
  const theme = useTheme();
  const map = useRef<MapView>(null);
  const region = regionFor(position ? [destination, position] : [destination]);

  useEffect(() => {
    map.current?.animateToRegion(region, 400);
    // Only the coordinates should retrigger the animation, not a new `region` object each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination.lat, destination.lng, position?.lat, position?.lng]);

  return (
    <MapView
      ref={map}
      provider={PROVIDER_GOOGLE}
      style={StyleSheet.absoluteFill}
      initialRegion={region}
      customMapStyle={mapStyle(theme)}
      showsMyLocationButton={false}
      toolbarEnabled={false}
      rotateEnabled={false}
      pitchEnabled={false}
    >
      <Marker
        coordinate={{ latitude: destination.lat, longitude: destination.lng }}
        pinColor={theme.colors.destinationPin}
      />
      {position ? (
        <Marker
          coordinate={{ latitude: position.lat, longitude: position.lng }}
          rotation={position.heading ?? 0}
          flat
          anchor={{ x: 0.5, y: 0.5 }}
        >
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.brand,
              borderWidth: 2,
              borderColor: theme.colors.bg,
            }}
          >
            <Navigation2 size={18} color={theme.colors.barText} fill={theme.colors.barText} />
          </View>
        </Marker>
      ) : null}
      {position ? (
        <Polyline
          coordinates={[
            { latitude: position.lat, longitude: position.lng },
            { latitude: destination.lat, longitude: destination.lng },
          ]}
          strokeColor={theme.colors.brand}
          strokeWidth={4}
        />
      ) : null}
    </MapView>
  );
}
