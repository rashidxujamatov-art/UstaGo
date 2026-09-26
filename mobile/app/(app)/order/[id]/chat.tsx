import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import {
  Check,
  CheckCheck,
  ChevronRight,
  FileText,
  Paperclip,
  Phone,
  SendHorizontal,
} from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { endpoints } from '../../../../src/api/endpoints';
import { queryKeys, useMessages, useOrder } from '../../../../src/api/queries';
import type { ChatMessage, Order } from '../../../../src/api/types';
import { useErrorText } from '../../../../src/api/use-error-text';
import { AppText } from '../../../../src/components/AppText';
import { Avatar } from '../../../../src/components/ui/Avatar';
import { BarHeader, BarIconButton } from '../../../../src/components/ui/BarHeader';
import { initials } from '../../../../src/lib/input';
import { callPhone } from '../../../../src/lib/maps';
import { pickAndUploadPhoto } from '../../../../src/lib/upload';
import { OrderPlaceholder } from '../../../../src/orders/OrderParts';
import { isChatOpen } from '../../../../src/orders/status';
import { useOrderTexts } from '../../../../src/orders/texts';
import { useTheme } from '../../../../src/theme/ThemeProvider';
import { showNotice } from '../../../../src/lib/notice';

const SYSTEM_CODES = [
  'ORDER_ACCEPTED',
  'EXECUTOR_EN_ROUTE',
  'EXECUTOR_ARRIVED',
  'WORK_STARTED',
  'WORK_FINISHED',
  'ORDER_CANCELLED',
  'CUSTOMER_PAID',
  'PAYMENT_RECEIVED',
  'ORDER_PAID',
  'DISPUTE_OPENED',
] as const;
type SystemCode = (typeof SYSTEM_CODES)[number];
const isSystemCode = (code: string | null): code is SystemCode =>
  SYSTEM_CODES.includes(code as SystemCode);

/** The other person of the chat: the pro for the customer and the customer for the pro. */
function counterpart(order: Order) {
  if (order.viewer_role === 'CUSTOMER' && order.executor) {
    return {
      firstName: order.executor.first_name,
      lastName: order.executor.last_name,
      phone: order.executor.phone,
    };
  }
  return {
    firstName: order.customer.first_name,
    lastName: order.customer.last_initial ? `${order.customer.last_initial}.` : '',
    phone: order.customer.phone,
  };
}

/** BY4: Telegram-style chat between the customer and the pro of one order. */
export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const errorText = useErrorText();
  const client = useQueryClient();
  const texts = useOrderTexts();
  const order = useOrder(id);
  const messages = useMessages(id);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const list = useMemo(() => [...(messages.data ?? [])].reverse(), [messages.data]);
  const unread = (messages.data ?? []).some(
    (message) => !message.from_me && message.kind !== 'SYSTEM' && !message.read_at,
  );

  // Double tick for the sender once the messages are on screen.
  useEffect(() => {
    if (unread) endpoints.markRead(id).catch(() => undefined);
  }, [unread, id]);

  const append = (message: ChatMessage) =>
    client.setQueryData<ChatMessage[]>(queryKeys.messages(id), (old) => [
      ...(old ?? []).filter((item) => item.id !== message.id),
      message,
    ]);

  const send = async (input: { text?: string; photo_key?: string }) => {
    setSending(true);
    try {
      append(await endpoints.sendMessage(id, input));
      if (input.text) setText('');
    } catch (error) {
      showNotice(errorText(error));
    } finally {
      setSending(false);
    }
  };

  const attach = async () => {
    try {
      const photo = await pickAndUploadPhoto('CHAT_PHOTO');
      if (photo) await send({ photo_key: photo.key });
    } catch {
      showNotice(t('errorsExtra.uploadInvalid'));
    }
  };

  if (!order.data) {
    return (
      <OrderPlaceholder
        error={order.isError ? errorText(order.error) : null}
        onRetry={() => void order.refetch()}
      />
    );
  }

  const other = counterpart(order.data);
  const open = isChatOpen(order.data.status);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.wall }}>
      <BarHeader
        title={[other.firstName, other.lastName].filter(Boolean).join(' ')}
        subtitle={t('order.title', { number: order.data.number })}
        left={<Avatar initials={initials(other.firstName, other.lastName)} size={44} ring />}
        right={
          other.phone ? (
            <BarIconButton
              icon={Phone}
              label={t('common.call')}
              onPress={() => other.phone && callPhone(other.phone)}
            />
          ) : null
        }
      />
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          router.canGoBack()
            ? router.back()
            : router.replace({ pathname: '/order/[id]', params: { id } })
        }
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.sep,
          backgroundColor: pressed ? theme.colors.surface2 : theme.colors.bg,
        })}
      >
        <FileText size={24} color={theme.colors.brandText} />
        <View style={{ flex: 1 }}>
          <AppText weight="bold" color="brandText" numberOfLines={1}>
            {t('chat.orderLink', {
              number: order.data.number,
              price: texts.money(order.data.price),
            })}
          </AppText>
          <AppText color="text2" numberOfLines={1}>
            {order.data.title}
          </AppText>
        </View>
        <ChevronRight size={22} color={theme.colors.text2} />
      </Pressable>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {messages.isPending ? (
          <ActivityIndicator style={{ flex: 1 }} color={theme.colors.brand} />
        ) : (
          <FlatList
            inverted
            data={list}
            keyExtractor={(message) => message.id}
            renderItem={({ item }) => <Bubble message={item} />}
            contentContainerStyle={{ padding: theme.spacing.md, gap: theme.spacing.sm }}
          />
        )}

        {open ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-end',
              gap: theme.spacing.sm,
              paddingHorizontal: theme.spacing.sm,
              paddingTop: theme.spacing.sm,
              paddingBottom: insets.bottom + theme.spacing.sm,
              backgroundColor: theme.colors.bg,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('chat.attach')}
              disabled={sending}
              onPress={() => void attach()}
              style={{
                width: theme.size.touchTarget,
                height: theme.size.touchTarget,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Paperclip size={26} color={theme.colors.text2} />
            </Pressable>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={t('chat.placeholder')}
              placeholderTextColor={theme.colors.text2}
              accessibilityLabel={t('chat.placeholder')}
              multiline
              maxLength={2000}
              style={{
                flex: 1,
                minWidth: 0,
                minHeight: theme.size.touchTarget,
                maxHeight: 140,
                paddingHorizontal: theme.spacing.lg,
                paddingTop: 13,
                paddingBottom: 13,
                borderRadius: 24,
                backgroundColor: theme.colors.surface2,
                fontFamily: theme.fontFamily.regular,
                fontSize: theme.fontSize.bodyLarge,
                color: theme.colors.text,
              }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('chat.send')}
              disabled={sending || text.trim().length === 0}
              onPress={() => void send({ text: text.trim() })}
              style={({ pressed }) => ({
                width: theme.size.touchTarget + 4,
                height: theme.size.touchTarget + 4,
                borderRadius: 26,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.brand,
                opacity: sending || text.trim().length === 0 ? 0.5 : pressed ? 0.85 : 1,
              })}
            >
              {sending ? (
                <ActivityIndicator color={theme.colors.barText} />
              ) : (
                <SendHorizontal size={24} color={theme.colors.barText} />
              )}
            </Pressable>
          </View>
        ) : (
          <View
            style={{
              padding: theme.spacing.lg,
              paddingBottom: insets.bottom + theme.spacing.lg,
              backgroundColor: theme.colors.bg,
            }}
          >
            <AppText color="text2" style={{ textAlign: 'center' }}>
              {t('errorsExtra.chatClosed')}
            </AppText>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const texts = useOrderTexts();
  const time = texts.clock(message.created_at);

  if (message.kind === 'SYSTEM') {
    return (
      <View
        style={{
          alignSelf: 'center',
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: 6,
          borderRadius: 999,
          backgroundColor: theme.colors.bg,
        }}
      >
        <AppText color="text2" weight="medium">
          {`${isSystemCode(message.system_code) ? t(`chat.system.${message.system_code}`) : ''} · ${time}`}
        </AppText>
      </View>
    );
  }

  const mine = message.from_me;
  const Tick = message.read_at ? CheckCheck : Check;
  return (
    <View
      style={{
        alignSelf: mine ? 'flex-end' : 'flex-start',
        maxWidth: '82%',
        padding: message.kind === 'PHOTO' ? 4 : theme.spacing.md,
        paddingBottom: theme.spacing.sm,
        borderRadius: theme.radius.card,
        borderBottomRightRadius: mine ? 4 : theme.radius.card,
        borderBottomLeftRadius: mine ? theme.radius.card : 4,
        backgroundColor: mine ? theme.colors.bubbleOut : theme.colors.bubbleIn,
        gap: 4,
      }}
    >
      {message.photo_url ? (
        <Image
          source={{ uri: message.photo_url }}
          accessibilityLabel={t('chat.photo')}
          style={{ width: 240, height: 240, borderRadius: theme.radius.md }}
        />
      ) : null}
      {message.text ? <AppText size="bodyLarge">{message.text}</AppText> : null}
      <View
        style={{
          flexDirection: 'row',
          alignSelf: 'flex-end',
          alignItems: 'center',
          gap: 4,
          paddingHorizontal: message.kind === 'PHOTO' ? theme.spacing.sm : 0,
        }}
      >
        <AppText size="caption" color="text2">
          {time}
        </AppText>
        {mine ? <Tick size={16} color={theme.colors.brandText} /> : null}
      </View>
    </View>
  );
}
