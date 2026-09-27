import { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { PROVIDER_GOOGLE } from 'react-native-maps';
import type { Coords } from '../../api/queries';
import { useTheme } from '../../theme/ThemeProvider';
import { mapStyle } from './map-style';
import { nativeMapsAvailable } from '../../lib/app-config';
import { MapPicker as MapPickerPlaceholder } from './MapPicker.web';

export interface MapPickerProps {
  /** Where the map moves to (start, search result, "my location"). */
  target: Coords;
  /** The point under the fixed center pin after the user stops moving the map. */
  onCenterChange: (center: Coords) => void;
}

/** Street-level zoom for placing the pin on a building. */
const DELTA = 0.004;

/** Google map under a fixed center pin (BY6). The web preview has a stand-in (.web.tsx). */
function NativeMapPicker({ target, onCenterChange }: MapPickerProps) {
  const theme = useTheme();
  const map = useRef<MapView>(null);
  const [initial] = useState(target);

  useEffect(() => {
    map.current?.animateToRegion(
      { latitude: target.lat, longitude: target.lng, latitudeDelta: DELTA, longitudeDelta: DELTA },
      400,
    );
  }, [target]);

  return (
    <MapView
      ref={map}
      provider={PROVIDER_GOOGLE}
      style={StyleSheet.absoluteFill}
      initialRegion={{
        latitude: initial.lat,
        longitude: initial.lng,
        latitudeDelta: DELTA,
        longitudeDelta: DELTA,
      }}
      customMapStyle={mapStyle(theme)}
      showsUserLocation
      showsMyLocationButton={false}
      toolbarEnabled={false}
      rotateEnabled={false}
      pitchEnabled={false}
      onRegionChangeComplete={(region) =>
        onCenterChange({ lat: region.latitude, lng: region.longitude })
      }
    />
  );
}

/** Google map, or the search-only placeholder when the build has no Maps SDK key. */
export function MapPicker(props: MapPickerProps) {
  return nativeMapsAvailable() ? (
    <NativeMapPicker {...props} />
  ) : (
    <MapPickerPlaceholder {...props} />
  );
}
