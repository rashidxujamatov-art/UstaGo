import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { OrdersService } from './orders.service.js';

export const ORDERS_QUEUE = 'orders';
const EXPIRE_JOB = 'order-expire';
/** Check interval; how late an expired job may disappear from the feed (technical). */
const EXPIRE_EVERY_MS = 60_000;

/** Schedules the repeatable expiry check (idempotent: same scheduler id every start). */
@Injectable()
export class OrderExpiryScheduler implements OnApplicationBootstrap {
  constructor(@InjectQueue(ORDERS_QUEUE) private readonly queue: Queue) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler(
      EXPIRE_JOB,
      { every: EXPIRE_EVERY_MS },
      { name: EXPIRE_JOB },
    );
  }
}

/** Cancels published jobs whose time window passed (docs/01 §3.3, §13). */
@Processor(ORDERS_QUEUE)
export class OrderExpiryProcessor extends WorkerHost {
  private readonly logger = new Logger(OrderExpiryProcessor.name);

  constructor(private readonly orders: OrdersService) {
    super();
  }

  async process(): Promise<{ expired: number }> {
    const expired = await this.orders.expireOverdue();
    if (expired > 0) this.logger.log(`Expired ${expired} unclaimed order(s)`);
    return { expired };
  }
}
