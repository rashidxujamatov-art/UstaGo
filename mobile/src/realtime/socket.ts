import { useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';
import { API_URL } from '../api';
import { useSession } from '../store/session';

/** Events the backend sends (docs/02-arxitektura.md §7). */
export type RealtimeEvent =
  | 'order.status'
  | 'payment.status'
  | 'chat.message'
  | 'chat.read'
  | 'notification'
  // Stage 6: to the order's customer only, except trip.ended which the pro also gets.
  | 'trip.position'
  | 'trip.eta'
  | 'trip.ended';

let socket: Socket | null = null;
let socketToken: string | null = null;

/** One connection per access token; reconnects when the token is refreshed. */
function connect(token: string): Socket {
  if (socket && socketToken === token) return socket;
  socket?.disconnect();
  const origin = new URL(API_URL).origin;
  socket = io(origin, { path: '/api/v1/socket.io', auth: { token }, transports: ['websocket'] });
  socketToken = token;
  return socket;
}

export function disconnectRealtime(): void {
  socket?.disconnect();
  socket = null;
  socketToken = null;
}

/** Subscribes to a realtime event while the component is mounted and the user is signed in. */
export function useRealtime<T>(event: RealtimeEvent, handler: (payload: T) => void): void {
  const token = useSession((state) => state.accessToken);
  useEffect(() => {
    if (!token || !API_URL) return undefined;
    const client = connect(token);
    const listener = (payload: T) => handler(payload);
    client.on(event, listener);
    return () => {
      client.off(event, listener);
    };
  }, [token, event, handler]);
}
