import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { PaymentsService } from './payments.service.js';
import { PAYOUTS_QUEUE, PayoutsService } from './payouts.service.js';

export const PAYMENTS_QUEUE = 'payments';
const EXPIRE_JOB = 'payment-session-expire';
/** docs/02-arxitektura.md §8: expired QR codes and links, every minute. */
const EXPIRE_EVERY_MS = 60_000;

@Injectable()
export class PaymentsScheduler implements OnApplicationBootstrap {
  constructor(@InjectQueue(PAYMENTS_QUEUE) private readonly queue: Queue) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler(
      EXPIRE_JOB,
      { every: EXPIRE_EVERY_MS },
      { name: EXPIRE_JOB },
    );
  }
}

/** Marks links and QR codes nobody paid in time as EXPIRED. */
@Processor(PAYMENTS_QUEUE)
export class PaymentsProcessor extends WorkerHost {
  private readonly logger = new Logger(PaymentsProcessor.name);

  constructor(private readonly payments: PaymentsService) {
    super();
  }

  async process(): Promise<{ expired: number }> {
    const expired = await this.payments.expireStale();
    if (expired > 0) this.logger.log(`Expired ${expired} payment link(s)`);
    return { expired };
  }
}

/** Sends requested withdrawals to the payout provider (retried with backoff). */
@Processor(PAYOUTS_QUEUE)
export class PayoutsProcessor extends WorkerHost {
  constructor(private readonly payouts: PayoutsService) {
    super();
  }

  async process(job: Job<{ withdrawalId: string }>): Promise<{ status: string | null }> {
    const result = await this.payouts.process(job.data.withdrawalId);
    return { status: result?.status ?? null };
  }
}
