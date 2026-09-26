import { useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useCallback } from 'react';
import { invalidateOrder, queryKeys } from '../../src/api/queries';
import { useRealtime } from '../../src/realtime/socket';
import { useTheme } from '../../src/theme/ThemeProvider';

export default function GroupLayout() {
  const theme = useTheme();
  useLiveUpdates();
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.bg } }}
    />
  );
}

/** Refreshes orders and chats when the backend reports a change (docs/02-arxitektura.md §7). */
function useLiveUpdates() {
  const client = useQueryClient();
  const onStatus = useCallback(
    (payload: { order_id: string }) => invalidateOrder(client, payload.order_id),
    [client],
  );
  const onChat = useCallback(
    (payload: { order_id: string }) =>
      void client.invalidateQueries({ queryKey: queryKeys.messages(payload.order_id) }),
    [client],
  );
  useRealtime('order.status', onStatus);
  useRealtime('chat.message', onChat);
  useRealtime('chat.read', onChat);
}
