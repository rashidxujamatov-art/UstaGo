import { Logger } from '@nestjs/common';
import { type OnGatewayConnection, WebSocketGateway } from '@nestjs/websockets';
import type { Socket } from 'socket.io';
import { TokenService } from '../auth/token.service.js';
import { userRoom } from './realtime.publisher.js';

/**
 * Socket.IO endpoint (docs/02-arxitektura.md §7). The access token is checked on connect;
 * each socket joins only its own user room, and events for an order are sent to the
 * rooms of its two parties.
 */
@WebSocketGateway({ path: '/api/v1/socket.io', cors: { origin: false } })
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(private readonly tokens: TokenService) {}

  async handleConnection(socket: Socket): Promise<void> {
    const token = (socket.handshake.auth as { token?: unknown }).token;
    if (typeof token !== 'string') {
      socket.disconnect(true);
      return;
    }
    try {
      const { userId } = await this.tokens.verifyAccess(token);
      (socket.data as { userId?: string }).userId = userId;
      await socket.join(userRoom(userId));
    } catch {
      this.logger.debug('Socket rejected: invalid token');
      socket.disconnect(true);
    }
  }
}
