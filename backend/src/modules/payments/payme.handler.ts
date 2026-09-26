import { timingSafeEqual } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';
import type { Payment } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import {
  PaymentNotCancellable,
  PaymentNotPerformable,
  PaymentsService,
} from './payments.service.js';

/** Payme cancels transactions that stay unperformed longer than this. */
const TRANSACTION_TIMEOUT_MS = 12 * 60 * 60 * 1000;
/** Payme cancel reason "timeout". */
const REASON_TIMEOUT = 4;

type Localized = { ru: string; uz: string; en: string };

/** Protocol errors (developer.help.paycom.uz). Payme shows `message` to the payer. */
const ERRORS = {
  AUTH: {
    code: -32504,
    message: msg('Недостаточно привилегий', 'Ruxsat yo‘q', 'Insufficient privilege'),
  },
  PARSE: { code: -32700, message: msg('Ошибка разбора', 'So‘rov noto‘g‘ri', 'Parse error') },
  REQUEST: { code: -32600, message: msg('Неверный запрос', 'So‘rov noto‘g‘ri', 'Invalid request') },
  METHOD: { code: -32601, message: msg('Метод не найден', 'Metod topilmadi', 'Method not found') },
  SYSTEM: { code: -32400, message: msg('Системная ошибка', 'Tizim xatosi', 'System error') },
  AMOUNT: { code: -31001, message: msg('Неверная сумма', 'Summa noto‘g‘ri', 'Incorrect amount') },
  NOT_FOUND: {
    code: -31003,
    message: msg('Транзакция не найдена', 'Tranzaksiya topilmadi', 'Transaction not found'),
  },
  CANNOT_CANCEL: {
    code: -31007,
    message: msg('Невозможно отменить', 'Bekor qilib bo‘lmaydi', 'Cannot cancel'),
  },
  CANNOT_PERFORM: {
    code: -31008,
    message: msg('Невозможно выполнить операцию', 'Amalni bajarib bo‘lmaydi', 'Unable to perform'),
  },
  ACCOUNT_NOT_FOUND: {
    code: -31050,
    message: msg('Платёж не найден', 'To‘lov topilmadi', 'Payment not found'),
    data: 'payment_id',
  },
  ACCOUNT_CLOSED: {
    code: -31051,
    message: msg('Платёж недоступен', 'To‘lov yopilgan', 'Payment is not available'),
    data: 'payment_id',
  },
} as const;

type PaymeError = { code: number; message: Localized; data?: string };

function msg(ru: string, uz: string, en: string): Localized {
  return { ru, uz, en };
}

class RpcFailure extends Error {
  constructor(readonly error: PaymeError) {
    super(`Payme RPC ${error.code}`);
  }
}

interface RpcRequest {
  id?: unknown;
  method?: unknown;
  params?: Record<string, unknown>;
}

/**
 * Payme Merchant API (JSON-RPC 2.0 at POST /payments/payme). Every call is authenticated
 * with Basic "Paycom:<PAYME_KEY>", in every environment (CLAUDE.md rule 4); without a key
 * all calls are refused. The account field is our payment id, so a callback never lands
 * on the wrong user or order. Amounts are tiyin.
 */
@Injectable()
export class PaymeMerchantHandler {
  private readonly logger = new Logger(PaymeMerchantHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async handle(authorization: string | undefined, body: unknown): Promise<Record<string, unknown>> {
    const request = (body && typeof body === 'object' ? body : {}) as RpcRequest;
    const id = request.id ?? null;
    try {
      if (!this.authorized(authorization)) throw new RpcFailure(ERRORS.AUTH);
      if (typeof request.method !== 'string' || !request.params) {
        throw new RpcFailure(ERRORS.REQUEST);
      }
      const result = await this.dispatch(request.method, request.params);
      return { jsonrpc: '2.0', id, result };
    } catch (error) {
      if (error instanceof RpcFailure) return { jsonrpc: '2.0', id, error: error.error };
      this.logger.error(`Payme ${String(request.method)} failed: ${String(error)}`);
      return { jsonrpc: '2.0', id, error: ERRORS.SYSTEM };
    }
  }

  private authorized(header: string | undefined): boolean {
    const key = this.config.get('PAYME_KEY', { infer: true });
    if (!key || !header?.startsWith('Basic ')) return false;
    const given = Buffer.from(header.slice(6).trim(), 'base64');
    const expected = Buffer.from(`Paycom:${key}`);
    return given.length === expected.length && timingSafeEqual(given, expected);
  }

  private dispatch(method: string, params: Record<string, unknown>) {
    switch (method) {
      case 'CheckPerformTransaction':
        return this.checkPerform(params);
      case 'CreateTransaction':
        return this.create(params);
      case 'PerformTransaction':
        return this.perform(params);
      case 'CancelTransaction':
        return this.cancel(params);
      case 'CheckTransaction':
        return this.check(params);
      case 'GetStatement':
        return this.statement(params);
      default:
        throw new RpcFailure(ERRORS.METHOD);
    }
  }

  // ---------------------------------------------------------------- methods

  private async checkPerform(params: Record<string, unknown>) {
    await this.payableFor(params);
    return { allow: true };
  }

  private async create(params: Record<string, unknown>) {
    const txnId = this.txnId(params);
    const time = typeof params.time === 'number' ? params.time : Date.now();
    const existing = await this.payments.findPaymeTxn(txnId);
    if (existing) {
      if (existing.status !== 'PENDING') throw new RpcFailure(ERRORS.CANNOT_PERFORM);
      if (this.timedOut(existing)) {
        await this.payments.cancel(existing.id, REASON_TIMEOUT);
        throw new RpcFailure(ERRORS.CANNOT_PERFORM);
      }
      return this.createResult(existing);
    }

    // A transaction Payme started more than 12 hours ago is not accepted any more.
    if (Date.now() - time > TRANSACTION_TIMEOUT_MS) throw new RpcFailure(ERRORS.CANNOT_PERFORM);
    const payment = await this.payableFor(params);
    // One Payme transaction per payment: a second one while the first is open is refused.
    if (payment.status === 'PENDING') throw new RpcFailure(ERRORS.ACCOUNT_CLOSED);
    const opened = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM payments WHERE id = ${payment.id}::uuid FOR UPDATE`;
      const current = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
      if (current.status !== 'CREATED') throw new RpcFailure(ERRORS.ACCOUNT_CLOSED);
      return this.payments.open(tx, payment.id, txnId, new Date());
    });
    return this.createResult(opened);
  }

  private async perform(params: Record<string, unknown>) {
    const payment = await this.payments.findPaymeTxn(this.txnId(params));
    if (!payment) throw new RpcFailure(ERRORS.NOT_FOUND);
    if (payment.status === 'PAID') return this.performResult(payment);
    if (payment.status !== 'PENDING') throw new RpcFailure(ERRORS.CANNOT_PERFORM);
    if (this.timedOut(payment)) {
      await this.payments.cancel(payment.id, REASON_TIMEOUT);
      throw new RpcFailure(ERRORS.CANNOT_PERFORM);
    }
    try {
      return this.performResult(await this.payments.perform(payment.id));
    } catch (error) {
      if (error instanceof PaymentNotPerformable) throw new RpcFailure(ERRORS.CANNOT_PERFORM);
      throw error;
    }
  }

  private async cancel(params: Record<string, unknown>) {
    const payment = await this.payments.findPaymeTxn(this.txnId(params));
    if (!payment) throw new RpcFailure(ERRORS.NOT_FOUND);
    const reason = typeof params.reason === 'number' ? params.reason : null;
    try {
      const cancelled = await this.payments.cancel(payment.id, reason);
      return {
        transaction: cancelled.id,
        cancel_time: cancelled.cancelledAt?.getTime() ?? 0,
        state: this.state(cancelled),
      };
    } catch (error) {
      if (error instanceof PaymentNotCancellable) throw new RpcFailure(ERRORS.CANNOT_CANCEL);
      throw error;
    }
  }

  private async check(params: Record<string, unknown>) {
    const payment = await this.payments.findPaymeTxn(this.txnId(params));
    if (!payment) throw new RpcFailure(ERRORS.NOT_FOUND);
    return {
      create_time: payment.providerCreatedAt?.getTime() ?? 0,
      perform_time: payment.performedAt?.getTime() ?? 0,
      cancel_time: payment.cancelledAt?.getTime() ?? 0,
      transaction: payment.id,
      state: this.state(payment),
      reason: payment.cancelReason,
    };
  }

  private async statement(params: Record<string, unknown>) {
    const from = typeof params.from === 'number' ? new Date(params.from) : new Date(0);
    const to = typeof params.to === 'number' ? new Date(params.to) : new Date();
    const rows = await this.prisma.payment.findMany({
      where: { provider: 'PAYME', providerCreatedAt: { gte: from, lte: to } },
      orderBy: { providerCreatedAt: 'asc' },
    });
    return {
      transactions: rows.map((payment) => ({
        id: payment.providerTxnId,
        time: payment.providerCreatedAt?.getTime() ?? 0,
        amount: Number(payment.amount),
        account: { payment_id: payment.id },
        create_time: payment.providerCreatedAt?.getTime() ?? 0,
        perform_time: payment.performedAt?.getTime() ?? 0,
        cancel_time: payment.cancelledAt?.getTime() ?? 0,
        transaction: payment.id,
        state: this.state(payment),
        reason: payment.cancelReason,
      })),
    };
  }

  // ---------------------------------------------------------------- helpers

  /** The payment named in `account.payment_id`, checked for amount and availability. */
  private async payableFor(params: Record<string, unknown>): Promise<Payment> {
    const account = (params.account ?? {}) as Record<string, unknown>;
    const payment = await this.payments.find(account.payment_id);
    if (!payment || (payment.provider !== 'PAYME' && payment.provider !== 'CARD')) {
      throw new RpcFailure(ERRORS.ACCOUNT_NOT_FOUND);
    }
    const amount = params.amount;
    if (typeof amount !== 'number' || !Number.isSafeInteger(amount)) {
      throw new RpcFailure(ERRORS.AMOUNT);
    }
    if (BigInt(amount) !== payment.amount) throw new RpcFailure(ERRORS.AMOUNT);
    if ((await this.payments.payable(payment)) !== 'OK') {
      throw new RpcFailure(ERRORS.ACCOUNT_CLOSED);
    }
    return payment;
  }

  private txnId(params: Record<string, unknown>): string {
    if (typeof params.id !== 'string' || params.id.length === 0 || params.id.length > 64) {
      throw new RpcFailure(ERRORS.REQUEST);
    }
    return params.id;
  }

  private timedOut(payment: Payment): boolean {
    const created = payment.providerCreatedAt?.getTime() ?? Date.now();
    return Date.now() - created > TRANSACTION_TIMEOUT_MS;
  }

  /** Payme transaction states: 1 created, 2 performed, -1 cancelled, -2 cancelled after perform. */
  private state(payment: Payment): number {
    switch (payment.status) {
      case 'PAID':
        return 2;
      case 'REFUNDED':
        return -2;
      case 'CANCELLED':
      case 'EXPIRED':
        return -1;
      default:
        return 1;
    }
  }

  private createResult(payment: Payment) {
    return {
      create_time: payment.providerCreatedAt?.getTime() ?? 0,
      transaction: payment.id,
      state: this.state(payment),
    };
  }

  private performResult(payment: Payment) {
    return {
      transaction: payment.id,
      perform_time: payment.performedAt?.getTime() ?? 0,
      state: this.state(payment),
    };
  }
}
