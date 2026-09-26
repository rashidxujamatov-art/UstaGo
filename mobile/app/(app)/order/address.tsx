import * as Crypto from 'expo-crypto';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { Check, Eye, MapPin, Navigation, Search } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { endpoints } from '../../../src/api/endpoints';
import type { Coords } from '../../../src/api/queries';
import type { PlaceSuggestion } from '../../../src/api/types';
import { useErrorText } from '../../../src/api/use-error-text';
import { AppText } from '../../../src/components/AppText';
import { BarHeader } from '../../../src/components/ui/BarHeader';
import { BoxField } from '../../../src/components/ui/BoxField';
import { Button } from '../../../src/components/ui/Button';
import { currentCoords } from '../../../src/lib/location';
import { MapPicker } from '../../../src/orders/map/MapPicker';
import { useOrderDraft } from '../../../src/store/order-draft';
import { usePreferences } from '../../../src/store/preferences';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { showNotice } from '../../../src/lib/notice';

/** Where the map opens without a saved address or location: central Tashkent. */
const DEFAULT_CENTER: Coords = { lat: 41.3111, lng: 69.2797 };
const PIN_SIZE = 52;
/** Shorter queries are not sent to Places (they cost money and match everything). */
const MIN_QUERY = 3;

const coordsText = ({ lat, lng }: Coords) => `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

/** About a metre: the map settling after an animation is not a new position. */
const samePlace = (a: Coords, b: Coords) =>
  Math.abs(a.lat - b.lat) < 1e-5 && Math.abs(a.lng - b.lng) < 1e-5;

/** BY6: the customer puts the pin on their house and adds entrance, floor and flat. */
export default function AddressScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const errorText = useErrorText();
  const language = usePreferences((state) => state.language);
  const saved = useOrderDraft((state) => state.address);

  const [target, setTarget] = useState<Coords>(saved ?? DEFAULT_CENTER);
  const [center, setCenter] = useState<Coords>(saved ?? DEFAULT_CENTER);
  const [text, setText] = useState<string | null>(saved?.text ?? null);
  const [detecting, setDetecting] = useState(false);
  const [details, setDetails] = useState({
    entrance: saved?.entrance ?? '',
    floor: saved?.floor ?? '',
    apartment: saved?.apartment ?? '',
    landmark: saved?.landmark ?? '',
  });

  // Search (Places autocomplete with one session token per search, docs/02 §9).
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const session = useRef(Crypto.randomUUID());
  /** Set when the map moves to a search result, so its address is not geocoded again. */
  const skipGeocode = useRef(Boolean(saved));

  // Start at the device location when the user already allowed it.
  useEffect(() => {
    if (saved) return;
    Location.getForegroundPermissionsAsync()
      .then(async (permission) => {
        if (!permission.granted) return;
        const found = await currentCoords();
        if (found) setTarget(found);
      })
      .catch(() => undefined);
  }, [saved]);

  // Address text for the pin, once the map stops moving.
  useEffect(() => {
    if (skipGeocode.current) {
      skipGeocode.current = false;
      return undefined;
    }
    let alive = true;
    setDetecting(true);
    const timer = setTimeout(() => {
      endpoints
        .reverseGeocode(center.lat, center.lng, language)
        .then((result) => alive && setText(result.address ?? coordsText(center)))
        .catch(() => alive && setText(coordsText(center)))
        .finally(() => alive && setDetecting(false));
    }, 500);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [center, language]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY) return undefined;
    let alive = true;
    const timer = setTimeout(() => {
      endpoints
        .autocomplete(q, session.current, language, center)
        .then((result) => alive && setSuggestions(result.suggestions))
        .catch(() => undefined);
    }, 350);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // The bias point is read when typing; moving the map does not re-run the search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, language]);

  const choose = async (suggestion: PlaceSuggestion) => {
    try {
      const place = await endpoints.place(suggestion.place_id, session.current, language);
      session.current = Crypto.randomUUID();
      skipGeocode.current = true;
      const point = { lat: place.lat, lng: place.lng };
      setText(place.address);
      setCenter(point);
      setTarget(point);
      setQuery('');
      setSuggestions([]);
    } catch (error) {
      showNotice(errorText(error));
    }
  };

  const myLocation = async () => {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) return;
      const found = await currentCoords();
      if (found) setTarget({ ...found });
    } catch {
      // Location services off.
    }
  };

  const shown = query.trim().length >= MIN_QUERY ? suggestions : [];

  const onCenterChange = useCallback(
    (next: Coords) => setCenter((previous) => (samePlace(previous, next) ? previous : next)),
    [],
  );

  const confirm = () => {
    if (!text) return;
    useOrderDraft.getState().set({
      address: { text, lat: center.lat, lng: center.lng, ...details },
    });
    router.back();
  };

  const detailField = (key: 'entrance' | 'floor' | 'apartment') => (
    <BoxField
      label={t(`address.${key}`)}
      value={details[key]}
      onChangeText={(value) => setDetails({ ...details, [key]: value })}
      maxLength={20}
      valueWeight="bold"
      grow
    />
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <BarHeader title={t('address.title')} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={{ flex: 1, minHeight: 220 }}>
          <MapPicker target={target} onCenterChange={onCenterChange} />

          {Platform.OS === 'web' ? null : (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: 0,
                right: 0,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <View style={{ alignItems: 'center', transform: [{ translateY: -PIN_SIZE / 2 }] }}>
                <View
                  style={{
                    marginBottom: theme.spacing.sm,
                    paddingHorizontal: theme.spacing.lg,
                    paddingVertical: theme.spacing.sm,
                    borderRadius: 999,
                    backgroundColor: theme.colors.text,
                  }}
                >
                  <AppText weight="bold" style={{ color: theme.colors.bg }}>
                    {t('address.pinHint')}
                  </AppText>
                </View>
                <MapPin
                  size={PIN_SIZE}
                  color={theme.colors.barText}
                  fill={theme.colors.brand}
                  strokeWidth={1.6}
                />
              </View>
            </View>
          )}

          <View style={{ position: 'absolute', top: theme.spacing.md, left: 0, right: 0 }}>
            <View
              style={{
                marginHorizontal: theme.spacing.lg,
                minHeight: theme.size.buttonPrimary,
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.md,
                paddingHorizontal: theme.spacing.lg,
                borderRadius: theme.radius.card,
                backgroundColor: theme.colors.surface,
                elevation: 3,
                shadowColor: theme.colors.scrim,
                shadowOpacity: 0.25,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 2 },
              }}
            >
              <Search size={22} color={theme.colors.text2} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={t('address.search')}
                placeholderTextColor={theme.colors.text2}
                accessibilityLabel={t('address.search')}
                returnKeyType="search"
                style={{
                  flex: 1,
                  minWidth: 0,
                  paddingVertical: theme.spacing.md,
                  fontFamily: theme.fontFamily.medium,
                  fontSize: theme.fontSize.bodyLarge,
                  color: theme.colors.text,
                }}
              />
            </View>
            {shown.length > 0 ? (
              <View
                style={{
                  marginHorizontal: theme.spacing.lg,
                  marginTop: theme.spacing.xs,
                  borderRadius: theme.radius.card,
                  backgroundColor: theme.colors.surface,
                  overflow: 'hidden',
                  elevation: 3,
                }}
              >
                {shown.map((suggestion) => (
                  <Pressable
                    key={suggestion.place_id}
                    accessibilityRole="button"
                    onPress={() => void choose(suggestion)}
                    style={({ pressed }) => ({
                      minHeight: theme.size.touchTarget + 8,
                      justifyContent: 'center',
                      paddingHorizontal: theme.spacing.lg,
                      paddingVertical: theme.spacing.sm,
                      borderBottomWidth: 1,
                      borderBottomColor: theme.colors.sep,
                      backgroundColor: pressed ? theme.colors.surface2 : 'transparent',
                    })}
                  >
                    <AppText weight="semibold">{suggestion.primary}</AppText>
                    {suggestion.secondary ? (
                      <AppText size="secondary" color="text2">
                        {suggestion.secondary}
                      </AppText>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>

          {Platform.OS === 'web' ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('address.myLocation')}
              onPress={() => void myLocation()}
              style={{
                position: 'absolute',
                right: theme.spacing.lg,
                bottom: theme.spacing.xl + theme.radius.sheet,
                width: 56,
                height: 56,
                borderRadius: 28,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.surface,
                elevation: 3,
                shadowColor: theme.colors.scrim,
                shadowOpacity: 0.25,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 2 },
              }}
            >
              <Navigation size={24} color={theme.colors.brandText} />
            </Pressable>
          )}
        </View>

        <View
          style={{
            marginTop: -theme.radius.sheet,
            borderTopLeftRadius: theme.radius.sheet,
            borderTopRightRadius: theme.radius.sheet,
            backgroundColor: theme.colors.bg,
            maxHeight: '62%',
          }}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              padding: theme.spacing.lg,
              paddingTop: theme.spacing.xl,
              gap: theme.spacing.md,
            }}
          >
            <View style={{ flexDirection: 'row', gap: theme.spacing.md, alignItems: 'center' }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: theme.radius.md,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.colors.destinationPin,
                }}
              >
                <MapPin size={24} color={theme.colors.barText} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText size="bodyLarge" weight="bold" numberOfLines={2}>
                  {text ?? t('address.detecting')}
                </AppText>
                <AppText size="secondary" color="text2">
                  {detecting ? t('address.detecting') : t('address.detected')}
                </AppText>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              {detailField('entrance')}
              {detailField('floor')}
              {detailField('apartment')}
            </View>
            <BoxField
              label={t('address.landmark')}
              placeholder={t('address.landmarkPlaceholder')}
              value={details.landmark}
              onChangeText={(landmark) => setDetails({ ...details, landmark })}
              maxLength={200}
            />
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <Eye size={20} color={theme.colors.brandText} style={{ marginTop: 2 }} />
              <AppText size="secondaryLarge" color="text2" style={{ flex: 1 }}>
                {t('address.privacy')}
              </AppText>
            </View>
          </ScrollView>
          <View
            style={{
              paddingHorizontal: theme.spacing.lg,
              paddingBottom: insets.bottom + theme.spacing.lg,
            }}
          >
            <Button
              title={t('address.confirm')}
              icon={Check}
              disabled={!text || detecting}
              onPress={confirm}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
