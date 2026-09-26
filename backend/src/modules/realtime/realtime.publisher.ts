import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Emitter } from '@socket.io/redis-emitter';
import type { Redis } from 'ioredis';
import { REDIS } from '../../infra/redis/redis.module.js';

/** Events sent to the app (docs/02-arxitektura.md §7). */
export type RealtimeEvent = 'order.status' | 'chat.message' | 'chat.read' | 'notification';

export const userRoom = (userId: string) => `user:${userId}`;
export const orderRoom = (orderId: string) => `order:${orderId}`;

/**
 * Publishes Socket.IO events through Redis, so the API and the worker can both reach
 * sockets connected to any API instance (the servers use the Redis adapter).
 */
@Injectable()
export class RealtimePublisher implements OnModuleDestroy {
  private readonly emitter: Emitter;
  private readonly client: Redis;

  constructor(@Inject(REDIS) redis: Redis) {
    this.client = redis.duplicate();
    this.emitter = new Emitter(this.client);
  }

  toUsers(
    userIds: readonly (string | null | undefined)[],
    event: RealtimeEvent,
    payload: unknown,
  ): void {
    const rooms = userIds.filter((id): id is string => Boolean(id)).map(userRoom);
    if (rooms.length > 0) this.emitter.to(rooms).emit(event, payload);
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
