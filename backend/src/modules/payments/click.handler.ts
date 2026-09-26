import { createHash, timingSafeEqual } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parseSomDecimal } from '../../common/money/money.js';
import type { Env } from '../../config/env.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { PaymentNotPerformable, PaymentsService } from './payments.service.js';

/** Click SHOP API error codes (docs.click.uz). */
const CLICK = {
  OK: 0,
  SIGN: -1,
  AMOUNT: -2,
  ACTION: -3,
  ALREADY_PAID: -4,
  NOT_FOUND: -5,
  TXN_NOT_FOUND: -6,
  UPDATE_FAILED: -7,
  REQUEST: -8,
  CANCELLED: -9,
} as const;

const NOTES: Record<number, string> = {
  [CLICK.OK]: 'Success',
  [CLICK.SIGN]: 'SIGN CHECK FAILED!',
  [CLICK.AMOUNT]: 'Incorrect parameter amount',
  [CLICK.ACTION]: 'Action not found',
  [CLICK.ALREADY_PAID]: 'Already paid',
  [CLICK.NOT_FOUND]: 'Payment does not exist',
  [CLICK.TXN_NOT_FOUND]: 'Transaction does not exist',
  [CLICK.UPDATE_FAILED]: 'Failed to update payment',
  [CLICK.REQUEST]: 'Error in request from click',
  [CLICK.CANCELLED]: 'Transaction cancelled',
};

type Params = Record<string, unknown>;

/**
 * Click SHOP API: Prepare (action 0) and Complete (action 1), form-encoded, signed with
 * MD5 over the parameters and CLICK_SECRET_KEY. The signature is checked in every
 * environment (CLAUDE.md rule 4); without a secret every call is refused. Amounts arrive
 * in so'm as decimal strings; merchant_trans_id is our payment id.
 */
@Injectable()
export class ClickShopHandler {
  private readonly logger = new Logger(ClickShopHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async prepare(params: Params): Promise<Record<string, unknown>> {
    const base = this.base(params);
    try {
      if (str(params.action) !== '0') return this.reply(base, CLICK.ACTION);
      if (!this.signed(params, false)) return this.reply(base, CLICK.SIGN);

      const payment = await this.payments.find(params.merchant_trans_id);
      if (!payment || payment.provider !== 'CLICK') return this.reply(base, CLICK.NOT_FOUND);
      const amount = parseSomDecimal(str(params.amount));
      if (amount === null || amount !== payment.amount) return this.reply(base, CLICK.AMOUNT);

      const clickTransId = str(params.click_trans_id);
      if (payment.status === 'PAID') return this.reply(base, CLICK.ALREADY_PAID);
      if (payment.status === 'PENDING') {
        // A repeated Prepare for the same Click transaction gets the same answer.
        return payment.providerTxnId === clickTransId
          ? this.reply(base, CLICK.OK, { merchant_prepare_id: payment.seq })
          : this.reply(base, CLICK.REQUEST);
      }
      const payable = await this.payments.payable(payment);
      if (payable === 'ORDER_PAID') return this.reply(base, CLICK.ALREADY_PAID);
      if (payable !== 'OK') return this.reply(base, CLICK.CANCELLED);

      const opened = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM payments WHERE id = ${payment.id}::uuid FOR UPDATE`;
        const current = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
        if (current.status !== 'CREATED') return null;
        return this.payments.open(tx, payment.id, clickTransId, new Date());
      });
      if (!opened) return this.reply(base, CLICK.REQUEST);
      return this.reply(base, CLICK.OK, { merchant_prepare_id: opened.seq });
    } catch (error) {
      this.logger.error(`Click prepare failed: ${String(error)}`);
      return this.reply(base, CLICK.UPDATE_FAILED);
    }
  }

  async complete(params: Params): Promise<Record<string, unknown>> {
    const base = this.base(params);
    try {
      if (str(params.action) !== '1') return this.reply(base, CLICK.ACTION);
      if (!this.signed(params, true)) return this.reply(base, CLICK.SIGN);

      const payment = await this.payments.find(params.merchant_trans_id);
      if (!payment || payment.provider !== 'CLICK') return this.reply(base, CLICK.NOT_FOUND);
      if (
        str(params.merchant_prepare_id) !== String(payment.seq) ||
        payment.providerTxnId !== str(params.click_trans_id)
      ) {
        return this.reply(base, CLICK.TXN_NOT_FOUND);
      }
      const amount = parseSomDecimal(str(params.amount));
      if (amount === null || amount !== payment.amount) return this.reply(base, CLICK.AMOUNT);
      if (payment.status === 'PAID') return this.reply(base, CLICK.ALREADY_PAID);
      if (payment.status !== 'PENDING') return this.reply(base, CLICK.CANCELLED);

      // Click reports its own failure with a negative `error`: nothing is booked.
      if (Number(str(params.error) || '0') < 0) {
        await this.payments.cancel(payment.id, Number(str(params.error)));
        return this.reply(base, CLICK.CANCELLED);
      }
      try {
        const paid = await this.payments.perform(payment.id);
        return this.reply(base, CLICK.OK, { merchant_confirm_id: paid.seq });
      } catch (error) {
        if (error instanceof PaymentNotPerformable) {
          await this.payments.cancel(payment.id, CLICK.CANCELLED);
          return this.reply(base, CLICK.CANCELLED);
        }
        throw error;
      }
    } catch (error) {
      this.logger.error(`Click complete failed: ${String(error)}`);
      return this.reply(base, CLICK.UPDATE_FAILED);
    }
  }

  /**
   * md5(click_trans_id + service_id + SECRET_KEY + merchant_trans_id
   *     [+ merchant_prepare_id] + amount + action + sign_time)
   */
  private signed(params: Params, complete: boolean): boolean {
    const secret = this.config.get('CLICK_SECRET_KEY', { infer: true });
    const serviceId = this.config.get('CLICK_SERVICE_ID', { infer: true });
    if (!secret || !serviceId || str(params.service_id) !== serviceId) return false;
    const source = [
      str(params.click_trans_id),
      str(params.service_id),
      secret,
      str(params.merchant_trans_id),
      complete ? str(params.merchant_prepare_id) : '',
      str(params.amount),
      str(params.action),
      str(params.sign_time),
    ].join('');
    const expected = Buffer.from(createHash('md5').update(source).digest('hex'));
    const given = Buffer.from(str(params.sign_string).toLowerCase());
    return given.length === expected.length && timingSafeEqual(given, expected);
  }

  private base(params: Params) {
    return {
      click_trans_id: toNumberOrString(params.click_trans_id),
      merchant_trans_id: str(params.merchant_trans_id),
    };
  }

  private reply(base: Record<string, unknown>, error: number, extra: Record<string, unknown> = {}) {
    return { ...base, ...extra, error, error_note: NOTES[error] ?? '' };
  }
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
}

function toNumberOrString(value: unknown): number | string {
  const text = str(value);
  return /^\d{1,15}$/.test(text) ? Number(text) : text;
}
