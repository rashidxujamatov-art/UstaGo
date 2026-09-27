import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Calendar, Camera, Check, ChevronRight, ImagePlus, MapPin, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError } from '../../../src/api/client';
import { endpoints } from '../../../src/api/endpoints';
import { queryKeys, useCategories, useConfig } from '../../../src/api/queries';
import type { PaymentMethod } from '../../../src/api/types';
import { useErrorText } from '../../../src/api/use-error-text';
import { AppText } from '../../../src/components/AppText';
import { BarHeader } from '../../../src/components/ui/BarHeader';
import { BoxField } from '../../../src/components/ui/BoxField';
import { Button } from '../../../src/components/ui/Button';
import { Card, Separator } from '../../../src/components/ui/Card';
import { Chip } from '../../../src/components/ui/Chip';
import { categoryIcon } from '../../../src/lib/categories';
import { formatAmount } from '../../../src/lib/format';
import { priceDigits, somDigitsToTiyin } from '../../../src/lib/input';
import { minutesLabel, tashkentDateTime } from '../../../src/lib/time';
import { pickAndUploadPhoto } from '../../../src/lib/upload';
import { ConfirmBlockSheet } from '../../../src/orders/ConfirmBlockSheet';
import { PAYMENT_ICONS } from '../../../src/orders/PaymentTag';
import { useOrderTexts } from '../../../src/orders/texts';
import { TimeSheet } from '../../../src/orders/TimeSheet';
import { useOrderDraft } from '../../../src/store/order-draft';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { showNotice } from '../../../src/lib/notice';

type Field = 'title' | 'address' | 'time' | 'price';

/** BY2: the customer posts a job. The address comes from BY6. */
export default function NewOrderScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const errorText = useErrorText();
  const client = useQueryClient();
  const texts = useOrderTexts();
  const draft = useOrderDraft();
  const categories = useCategories();
  const config = useConfig();
  const [timeOpen, setTimeOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [blockingOrder, setBlockingOrder] = useState<string | null>(null);
  /** Errors show after the first submit and then follow the input. */
  const [submitted, setSubmitted] = useState(false);

  // XOLIS_QR is not chosen at posting time: a cash job may be paid to a Xolis pro's QR
  // instead of cash, offered at payment time (BY9, decision of 2026-09-26, stage 5).
  const methods = useMemo(
    () =>
      (config.data?.payment_methods_enabled ?? []).filter(
        (method) => method !== 'XOLIS_QR',
      ) as PaymentMethod[],
    [config.data],
  );
  const photosMax = config.data?.order_photos_max ?? 0;
  const { set } = draft;

  const price = somDigitsToTiyin(draft.price);
  const problems: Partial<Record<Field, string>> = {};
  if (draft.title.trim().length < 3) problems.title = t('newOrder.needTitle');
  if (!draft.address) problems.address = t('newOrder.needAddress');
  if (!draft.time) problems.time = t('newOrder.needTime');
  if (!price) problems.price = t('newOrder.needPrice');
  const errors = submitted ? problems : {};

  // Defaults once the lists arrive: the first category and payment method.
  useEffect(() => {
    const first = categories.data?.[0];
    if (!draft.categoryId && first) set({ categoryId: first.id });
  }, [categories.data, draft.categoryId, set]);
  useEffect(() => {
    const first = methods[0];
    if (first && (!draft.method || !methods.includes(draft.method))) set({ method: first });
  }, [methods, draft.method, set]);

  const addPhoto = async () => {
    setUploading(true);
    try {
      const photo = await pickAndUploadPhoto('ORDER_PHOTO');
      if (photo) set({ photos: [...useOrderDraft.getState().photos, photo] });
    } catch {
      showNotice(t('newOrder.photoFailed'));
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    setSubmitted(true);
    const { categoryId, address, time, method } = draft;
    if (Object.keys(problems).length > 0 || !categoryId || !address || !time || !price || !method) {
      return;
    }

    setSubmitting(true);
    try {
      const order = await endpoints.createOrder({
        category_id: categoryId,
        title: draft.title.trim(),
        description: draft.description.trim(),
        photo_keys: draft.photos.map((photo) => photo.key),
        address: {
          text: address.text,
          lat: address.lat,
          lng: address.lng,
          entrance: address.entrance.trim() || undefined,
          floor: address.floor.trim() || undefined,
          apartment: address.apartment.trim() || undefined,
          landmark: address.landmark.trim() || undefined,
        },
        time_from: tashkentDateTime(time.day, time.from).toISOString(),
        time_to: tashkentDateTime(time.day, time.to).toISOString(),
        price,
        payment_method: method,
      });
      draft.reset();
      void client.invalidateQueries({ queryKey: queryKeys.orders });
      router.replace({ pathname: '/order/[id]', params: { id: order.id } });
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.code === 'ORDER_CUSTOMER_CONFIRMATION_REQUIRED' &&
        typeof error.params.order_id === 'string'
      ) {
        // BY10: the previous cash / Xolis order waits for "To'ladim" (§5.1).
        setBlockingOrder(error.params.order_id);
      } else {
        showNotice(errorText(error));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const timeText = draft.time
    ? `${texts.startsAt(tashkentDateTime(draft.time.day, draft.time.from).toISOString())} – ${minutesLabel(draft.time.to)}`
    : null;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg2 }}>
      <BarHeader title={t('newOrder.title')} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingVertical: theme.spacing.lg, gap: theme.spacing.lg }}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            accessibilityRole="radiogroup"
            contentContainerStyle={{ gap: theme.spacing.sm, paddingHorizontal: theme.spacing.lg }}
          >
            {(categories.data ?? []).map((category) => (
              <Chip
                key={category.id}
                label={texts.category(category)}
                icon={categoryIcon(category.icon)}
                selected={draft.categoryId === category.id}
                onPress={() => set({ categoryId: category.id })}
              />
            ))}
          </ScrollView>

          <Card style={{ marginHorizontal: theme.spacing.lg }}>
            <BoxField
              label={t('newOrder.titleLabel')}
              placeholder={t('newOrder.titlePlaceholder')}
              value={draft.title}
              onChangeText={(title) => set({ title })}
              maxLength={120}
              error={errors.title}
            />
            <BoxField
              label={t('newOrder.descLabel')}
              placeholder={t('newOrder.descPlaceholder')}
              value={draft.description}
              onChangeText={(description) => set({ description })}
              maxLength={2000}
              multiline
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md }}>
              {draft.photos.map((photo) => (
                <View key={photo.key}>
                  <Image
                    source={{ uri: photo.uri }}
                    accessibilityIgnoresInvertColors
                    style={{ width: 64, height: 64, borderRadius: theme.radius.md }}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('newOrder.removePhoto')}
                    hitSlop={12}
                    onPress={() =>
                      set({ photos: draft.photos.filter((item) => item.key !== photo.key) })
                    }
                    style={{
                      position: 'absolute',
                      top: -8,
                      right: -8,
                      width: 26,
                      height: 26,
                      borderRadius: 13,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: theme.colors.text,
                    }}
                  >
                    <X size={16} color={theme.colors.bg} />
                  </Pressable>
                </View>
              ))}
              {draft.photos.length < photosMax ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('newOrder.photo')}
                  disabled={uploading}
                  onPress={() => void addPhoto()}
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: theme.radius.md,
                    borderWidth: 1.5,
                    borderStyle: 'dashed',
                    borderColor: theme.colors.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 2,
                  }}
                >
                  {uploading ? (
                    <ActivityIndicator color={theme.colors.brand} />
                  ) : (
                    <>
                      {draft.photos.length === 0 ? (
                        <Camera size={22} color={theme.colors.brandText} />
                      ) : (
                        <ImagePlus size={22} color={theme.colors.brandText} />
                      )}
                      <AppText size="caption" weight="semibold" color="brandText">
                        {t('newOrder.photo')}
                      </AppText>
                    </>
                  )}
                </Pressable>
              ) : null}
              {draft.photos.length === 0 ? (
                <AppText size="secondary" color="text2" style={{ flex: 1, minWidth: 140 }}>
                  {t('newOrder.photoHint')}
                </AppText>
              ) : null}
            </View>
          </Card>

          <Card style={{ marginHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.xs }}>
            <PickerRow
              icon={MapPin}
              iconColor={theme.colors.destinationPin}
              label={t('newOrder.address')}
              value={draft.address?.text}
              placeholder={t('newOrder.addressPlaceholder')}
              error={errors.address}
              onPress={() => router.push('/order/address')}
            />
            <Separator inset={60} />
            <PickerRow
              icon={Calendar}
              iconColor={theme.colors.brand}
              label={t('newOrder.when')}
              value={timeText}
              placeholder={t('newOrder.whenPlaceholder')}
              error={errors.time}
              onPress={() => setTimeOpen(true)}
            />
          </Card>

          <Card style={{ marginHorizontal: theme.spacing.lg }}>
            <BoxField
              label={t('newOrder.price')}
              value={draft.price ? formatAmount(BigInt(draft.price) * 100n, texts.language) : ''}
              onChangeText={(text) => set({ price: priceDigits(text) })}
              keyboardType="number-pad"
              valueSize="title"
              valueWeight="bold"
              error={errors.price}
              suffix={
                <AppText size="title" color="text2">
                  {t('common.currency')}
                </AppText>
              }
            />
            <AppText weight="semibold" color="text2">
              {t('newOrder.paymentMethod')}
            </AppText>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              accessibilityRole="radiogroup"
              contentContainerStyle={{ gap: theme.spacing.sm }}
            >
              {methods.map((method) => (
                <Chip
                  key={method}
                  label={t(`payment.method.${method}`)}
                  icon={PAYMENT_ICONS[method]}
                  selected={draft.method === method}
                  onPress={() => set({ method })}
                />
              ))}
            </ScrollView>
          </Card>
        </ScrollView>

        <View
          style={{
            padding: theme.spacing.lg,
            paddingBottom: insets.bottom + theme.spacing.lg,
            borderTopWidth: 1,
            borderTopColor: theme.colors.sep,
            backgroundColor: theme.colors.bg,
          }}
        >
          <Button
            title={t('newOrder.submit')}
            icon={Check}
            loading={submitting}
            onPress={() => void submit()}
          />
        </View>
      </KeyboardAvoidingView>

      <TimeSheet
        visible={timeOpen}
        value={draft.time}
        onClose={() => setTimeOpen(false)}
        onChoose={(time) => {
          set({ time });
          setTimeOpen(false);
        }}
      />
      <ConfirmBlockSheet orderId={blockingOrder} onClose={() => setBlockingOrder(null)} />
    </View>
  );
}

interface PickerRowProps {
  icon: typeof MapPin;
  iconColor: string;
  label: string;
  value?: string | null;
  placeholder: string;
  error?: string;
  onPress: () => void;
}

function PickerRow({
  icon: Icon,
  iconColor,
  label,
  value,
  placeholder,
  error,
  onPress,
}: PickerRowProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        minHeight: 64,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.lg,
        paddingVertical: theme.spacing.md,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: theme.radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: iconColor,
        }}
      >
        <Icon size={24} color={theme.colors.barText} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText size="secondaryLarge" color="text2">
          {label}
        </AppText>
        <AppText
          size="bodyLarge"
          weight={value ? 'semibold' : 'regular'}
          color={value ? 'text' : 'text2'}
          numberOfLines={1}
        >
          {value ?? placeholder}
        </AppText>
        {error ? (
          <AppText size="secondary" color="red">
            {error}
          </AppText>
        ) : null}
      </View>
      <ChevronRight size={22} color={theme.colors.text2} />
    </Pressable>
  );
}
