import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { OrdersService } from './orders.service.js';

export const ORDERS_QUEUE = 'orders';
const EXPIRE_JOB = 'order-expire';
const PAYMENT_REMINDERS_JOB = 'payment-reminders';
/** Check intervals (technical): how late an expired job may stay in the feed, how late a reminder may come. */
const EXPIRE_EVERY_MS = 60_000;
const PAYMENT_REMINDERS_EVERY_MS = 5 * 60_000;

/** Schedules the repeatable order jobs (idempotent: same scheduler ids every start). */
@Injectable()
export class OrderExpiryScheduler implements OnApplicationBootstrap {
  constructor(@InjectQueue(ORDERS_QUEUE) private readonly queue: Queue) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler(
      EXPIRE_JOB,
      { every: EXPIRE_EVERY_MS },
      { name: EXPIRE_JOB },
    );
    await this.queue.upsertJobScheduler(
      PAYMENT_REMINDERS_JOB,
      { every: PAYMENT_REMINDERS_EVERY_MS },
      { name: PAYMENT_REMINDERS_JOB },
    );
  }
}

/**
 * Order jobs: cancels published jobs whose time window passed (docs/01 §3.3, §13) and
 * reminds the side that has not confirmed a cash / Xolis payment (§5.1).
 */
@Processor(ORDERS_QUEUE)
export class OrderExpiryProcessor extends WorkerHost {
  private readonly logger = new Logger(OrderExpiryProcessor.name);

  constructor(private readonly orders: OrdersService) {
    super();
  }

  async process(job: Job): Promise<{ count: number }> {
    if (job.name === PAYMENT_REMINDERS_JOB) {
      const count = await this.orders.sendPaymentReminders();
      if (count > 0) this.logger.log(`Sent ${count} payment reminder(s)`);
      return { count };
    }
    const count = await this.orders.expireOverdue();
    if (count > 0) this.logger.log(`Expired ${count} unclaimed order(s)`);
    return { count };
  }
}
