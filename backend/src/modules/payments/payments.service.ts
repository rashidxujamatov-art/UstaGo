import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { formatSomDecimal, TIYIN_PER_SOM } from '../../common/money/money.js';
import type { Env } from '../../config/env.js';
import type { Payment, PaymentProvider, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { OnlinePaid } from '../orders/orders.service.js';
import { OrdersService } from '../orders/orders.service.js';
import type { OrderView } from '../orders/order-view.js';
import { RealtimePublisher } from '../realtime/realtime.publisher.js';
import { SettingsService } from '../settings/settings.service.js';
import { LedgerService, PLATFORM } from '../wallet/ledger.service.js';
import { WalletService } from '../wallet/wallet.service.js';
import { CardError } from './card.provider.js';
import { cardErrorCode, CardsService } from './cards.service.js';

type Tx = Prisma.TransactionClient;

/** How long a top-up link stays open (technical; the QR of BJ4 uses qr_payment_ttl_sec). */
const TOPUP_LINK_TTL_MS = 30 * 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type LinkProvider = 'PAYME' | 'CLICK';

export interface PaymentView {
  id: string;
  provider: PaymentProvider;
  purpose: 'TOPUP' | 'ORDER';
  /** Tiyin. */
  amount: string;
  status: Payment['status'];
  order_id: string | null;
  /** Click / Payme page or app link; also the BJ4 QR content. Null for cards. */
  checkout_url: string | null;
  expires_at: string;
  /** PAYMENT_TEST_MODE: the app may finish the payment without the provider. */
  test_mode: boolean;
}

/** The provider transaction cannot be completed (order paid another way, link expired). */
export class PaymentNotPerformable extends Error {
  constructor(readonly reason: 'STATUS' | 'ORDER') {
    super(`Payment cannot be performed: ${reason}`);
    this.name = 'PaymentNotPerformable';
  }
}

/** A performed top-up cannot be taken back: the money was already spent. */
export class PaymentNotCancellable extends Error {
  constructor() {
    super('Payment cannot be cancelled');
    this.name = 'PaymentNotCancellable';
  }
}

/**
 * Payments through Payme, Click and saved cards (docs/01-biznes-qoidalar.md §5, §7):
 * top-ups (BJ6), order payments (BY5) and the executor's QR (BJ4). The provider
 * callbacks (PaymeMerchantHandler, ClickShopHandler) drive the same perform / cancel
 * steps, each inside one DB transaction with the payment row locked.
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly settings: SettingsService,
    private readonly ledger: LedgerService,
    private readonly wallet: WalletService,
    private readonly orders: OrdersService,
    private readonly cards: CardsService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimePublisher,
  ) {}

  // ---------------------------------------------------------------- app side

  /** BJ6: a top-up by Click, Payme or a saved card (§7, topup_min, no fee). */
  async topup(
    userId: string,
    input: { amount: bigint; method: 'CLICK' | 'PAYME' | 'CARD'; cardId?: string },
  ): Promise<PaymentView> {
    const s = await this.settings.getAll();
    if (!s.payment_methods_enabled.includes(input.method)) {
      throw new AppError(ErrorCode.ORDER_PAYMENT_METHOD_DISABLED);
    }
    if (input.amount < s.topup_min || input.amount % TIYIN_PER_SOM !== 0n) {
      throw new AppError(ErrorCode.PAYMENT_AMOUNT_INVALID, { min: s.topup_min });
    }
    if (input.method === 'CARD') {
      const payment = await this.prisma.payment.create({
        data: {
          provider: 'CARD',
          purpose: 'TOPUP',
          userId,
          amount: input.amount,
          cardId: input.cardId ?? null,
          expiresAt: new Date(Date.now() + TOPUP_LINK_TTL_MS),
        },
      });
      return this.chargeCard(payment, userId, input.cardId);
    }
    this.assertLinkProvider(input.method);
    const payment = await this.prisma.payment.create({
      data: {
        provider: input.method,
        purpose: 'TOPUP',
        userId,
        amount: input.amount,
        expiresAt: new Date(Date.now() + TOPUP_LINK_TTL_MS),
      },
    });
    return this.view(payment);
  }

  /**
   * BY5: the customer pays a finished job with the method chosen when it was posted
   * (§3.1, decision of 2026-09-26): from the balance at once, by card, or through a
   * Click / Payme link. Cash and Xolis are confirmed on BY9 instead.
   */
  async payOrder(
    userId: string,
    orderId: string,
    cardId?: string,
  ): Promise<{ payment: PaymentView | null; order: OrderView | null }> {
    const order = await this.orders.payableOrder(orderId);
    if (order.customerId !== userId) throw new AppError(ErrorCode.NOT_FOUND, {}, 404);
    if (!order.payable) {
      throw new AppError(ErrorCode.ORDER_STATUS_CONFLICT, { status: order.status }, 409);
    }
    switch (order.paymentMethod) {
      case 'BALANCE':
        return { payment: null, order: await this.orders.payFromBalance(userId, orderId) };
      case 'CARD': {
        const payment = await this.createOrderPayment(order, 'CARD', null, cardId);
        return { payment: await this.chargeCard(payment, userId, cardId), order: null };
      }
      case 'CLICK':
      case 'PAYME':
        this.assertLinkProvider(order.paymentMethod);
        return {
          payment: this.view(await this.createOrderPayment(order, order.paymentMethod, null)),
          order: null,
        };
      default:
        throw new AppError(
          ErrorCode.ORDER_PAYMENT_METHOD_MISMATCH,
          { method: order.paymentMethod },
          HttpStatus.CONFLICT,
        );
    }
  }

  /** BJ4: the executor shows a Click / Payme QR for the customer to scan (§5). */
  async orderQr(executorId: string, orderId: string): Promise<PaymentView> {
    const order = await this.orders.payableOrder(orderId);
    if (order.executorId !== executorId) throw new AppError(ErrorCode.NOT_FOUND, {}, 404);
    if (!order.payable) {
      throw new AppError(ErrorCode.ORDER_STATUS_CONFLICT, { status: order.status }, 409);
    }
    if (order.paymentMethod !== 'CLICK' && order.paymentMethod !== 'PAYME') {
      throw new AppError(
        ErrorCode.ORDER_PAYMENT_METHOD_MISMATCH,
        { method: order.paymentMethod },
        HttpStatus.CONFLICT,
      );
    }
    this.assertLinkProvider(order.paymentMethod);
    return this.view(await this.createOrderPayment(order, order.paymentMethod, executorId));
  }

  async get(userId: string, paymentId: string): Promise<PaymentView> {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment || (payment.userId !== userId && payment.createdBy !== userId)) {
      throw new AppError(ErrorCode.NOT_FOUND, {}, HttpStatus.NOT_FOUND);
    }
    return this.view(payment);
  }

  /**
   * PAYMENT_TEST_MODE only (development): finishes a Click / Payme payment as if the
   * provider had confirmed it, so the flow can be tried without merchant accounts.
   */
  async testComplete(userId: string, paymentId: string): Promise<PaymentView> {
    if (!this.config.get('PAYMENT_TEST_MODE', { infer: true })) {
      throw new AppError(ErrorCode.NOT_FOUND, {}, HttpStatus.NOT_FOUND);
    }
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment || (payment.userId !== userId && payment.createdBy !== userId)) {
      throw new AppError(ErrorCode.NOT_FOUND, {}, HttpStatus.NOT_FOUND);
    }
    try {
      if (payment.status === 'CREATED') {
        await this.prisma.$transaction((tx) =>
          this.open(tx, payment.id, `test-${payment.id}`, new Date()),
        );
      }
      await this.perform(payment.id);
    } catch (error) {
      if (error instanceof PaymentNotPerformable) {
        throw new AppError(ErrorCode.PAYMENT_NOT_AVAILABLE, {}, HttpStatus.CONFLICT);
      }
      throw error;
    }
    return this.get(userId, paymentId);
  }

  // ---------------------------------------------------------------- provider side

  /** The payment a provider refers to by our id; null for anything unknown. */
  async find(id: unknown): Promise<Payment | null> {
    if (typeof id !== 'string' || !UUID.test(id)) return null;
    return this.prisma.payment.findUnique({ where: { id } });
  }

  async findByProviderTxn(provider: PaymentProvider, txnId: string): Promise<Payment | null> {
    return this.prisma.payment.findUnique({
      where: { provider_providerTxnId: { provider, providerTxnId: txnId } },
    });
  }

  /** Payme transactions also pay saved-card receipts (CARD_PROVIDER=payme). */
  async findPaymeTxn(txnId: string): Promise<Payment | null> {
    return this.prisma.payment.findFirst({
      where: { providerTxnId: txnId, provider: { in: ['PAYME', 'CARD'] } },
    });
  }

  /** Whether the payment may still be paid: open, not expired, its order still unpaid. */
  async payable(payment: Payment, now = new Date()): Promise<'OK' | 'CLOSED' | 'ORDER_PAID'> {
    if (payment.status !== 'CREATED' && payment.status !== 'PENDING') return 'CLOSED';
    if (payment.status === 'CREATED' && payment.expiresAt <= now) return 'CLOSED';
    if (payment.purpose === 'ORDER' && payment.orderId) {
      const order = await this.orders.payableOrder(payment.orderId);
      if (!order.payable) return 'ORDER_PAID';
    }
    return 'OK';
  }

  /** The provider opened its transaction (Payme CreateTransaction, Click Prepare). */
  async open(tx: Tx, paymentId: string, providerTxnId: string, at: Date): Promise<Payment> {
    return tx.payment.update({
      where: { id: paymentId },
      data: { status: 'PENDING', providerTxnId, providerCreatedAt: at },
    });
  }

  /**
   * Books the money of a confirmed payment: a top-up to the user's REAL account, or the
   * order settlement (§5). Idempotent: a paid payment is returned as is.
   */
  async perform(paymentId: string): Promise<Payment> {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM payments WHERE id = ${paymentId}::uuid FOR UPDATE`;
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
      if (payment.status === 'PAID') return { payment, paid: null };
      if (payment.status !== 'PENDING') throw new PaymentNotPerformable('STATUS');

      let paid: OnlinePaid | null = null;
      if (payment.purpose === 'TOPUP') {
        await this.wallet.lock(tx, payment.userId);
        await this.ledger.post(tx, {
          type: 'TOPUP',
          idempotencyKey: `payment:${payment.id}`,
          paymentId: payment.id,
          createdBy: payment.userId,
          entries: [
            {
              accountId: await this.ledger.accountId(tx, PLATFORM, 'PAYMENT_CLEARING'),
              amount: -payment.amount,
            },
            {
              accountId: await this.ledger.accountId(tx, payment.userId, 'REAL'),
              amount: payment.amount,
            },
          ],
        });
      } else if (payment.orderId) {
        try {
          paid = await this.orders.settleOnlineInTx(tx, payment.orderId, null);
        } catch (error) {
          if (error instanceof AppError) throw new PaymentNotPerformable('ORDER');
          throw error;
        }
        if (!paid) throw new PaymentNotPerformable('ORDER');
        await tx.ledgerTransaction.updateMany({
          where: { idempotencyKey: `order:${payment.orderId}:income` },
          data: { paymentId: payment.id },
        });
      }
      const updated = await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'PAID', performedAt: new Date() },
      });
      await this.audit.log(
        {
          actorType: 'SYSTEM',
          action: 'payment.perform',
          entityType: 'payment',
          entityId: payment.id,
          data: {
            provider: payment.provider,
            purpose: payment.purpose,
            amount: payment.amount.toString(),
          },
        },
        tx,
      );
      return { payment: updated, paid };
    });

    if (result.paid) await this.orders.notifyOnlinePaid(result.paid);
    this.publish(result.payment);
    return result.payment;
  }

  /**
   * The provider cancels. Before perform nothing moved; after perform only a top-up can be
   * taken back, and only while the money is still in the account. Order payments are
   * refunded by an admin decision (stage 7), never here.
   */
  async cancel(paymentId: string, reason: number | null): Promise<Payment> {
    const payment = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM payments WHERE id = ${paymentId}::uuid FOR UPDATE`;
      const current = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
      if (current.status === 'CANCELLED' || current.status === 'REFUNDED') return current;
      if (current.status !== 'PAID') {
        return tx.payment.update({
          where: { id: paymentId },
          data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason },
        });
      }
      if (current.purpose !== 'TOPUP') throw new PaymentNotCancellable();

      await this.wallet.lock(tx, current.userId);
      const b = await this.wallet.balances(current.userId, tx);
      const free = b.real - b.heldReal;
      if (free < current.amount) throw new PaymentNotCancellable();
      await this.ledger.post(tx, {
        type: 'TOPUP_REFUND',
        idempotencyKey: `payment:${current.id}:refund`,
        paymentId: current.id,
        entries: [
          {
            accountId: await this.ledger.accountId(tx, current.userId, 'REAL'),
            amount: -current.amount,
          },
          {
            accountId: await this.ledger.accountId(tx, PLATFORM, 'PAYMENT_CLEARING'),
            amount: current.amount,
          },
        ],
      });
      await this.audit.log(
        {
          actorType: 'SYSTEM',
          action: 'payment.refund',
          entityType: 'payment',
          entityId: current.id,
          data: { amount: current.amount.toString(), reason },
        },
        tx,
      );
      return tx.payment.update({
        where: { id: paymentId },
        data: { status: 'REFUNDED', cancelledAt: new Date(), cancelReason: reason },
      });
    });
    this.publish(payment);
    return payment;
  }

  /** Links and QR codes nobody opened in time (worker, every minute). */
  async expireStale(now = new Date()): Promise<number> {
    const { count } = await this.prisma.payment.updateMany({
      where: { status: 'CREATED', expiresAt: { lte: now } },
      data: { status: 'EXPIRED' },
    });
    return count;
  }

  // ---------------------------------------------------------------- helpers

  private async createOrderPayment(
    order: { id: string; price: bigint; customerId: string },
    provider: PaymentProvider,
    createdBy: string | null,
    cardId?: string,
  ): Promise<Payment> {
    const { qr_payment_ttl_sec: ttl } = await this.settings.getAll();
    return this.prisma.$transaction(async (tx) => {
      // One open link per order: an older QR stops working when a new one is shown.
      await tx.payment.updateMany({
        where: { orderId: order.id, status: 'CREATED' },
        data: { status: 'EXPIRED' },
      });
      return tx.payment.create({
        data: {
          provider,
          purpose: 'ORDER',
          userId: order.customerId,
          orderId: order.id,
          createdBy,
          amount: order.price,
          cardId: cardId ?? null,
          expiresAt: new Date(Date.now() + ttl * 1000),
        },
      });
    });
  }

  /** Charges a saved card for a CARD payment and books it; a decline cancels the payment. */
  private async chargeCard(
    payment: Payment,
    userId: string,
    cardId: string | undefined,
  ): Promise<PaymentView> {
    if (!cardId) throw new AppError(ErrorCode.VALIDATION_FAILED, { fields: 'card_id' });
    const { token } = await this.cards.token(userId, cardId);
    let receiptId: string;
    try {
      ({ receiptId } = await this.cards.charge({
        token,
        amount: payment.amount,
        paymentId: payment.id,
      }));
    } catch (error) {
      await this.cancel(payment.id, null);
      if (error instanceof CardError) throw cardErrorCode(error);
      throw error;
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        const current = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
        // A Payme callback may have opened it already (docs/02 §9).
        if (current.status === 'CREATED') await this.open(tx, payment.id, receiptId, new Date());
      });
      return this.view(await this.perform(payment.id));
    } catch (error) {
      if (error instanceof PaymentNotPerformable) {
        throw new AppError(ErrorCode.PAYMENT_NOT_AVAILABLE, {}, HttpStatus.CONFLICT);
      }
      throw error;
    }
  }

  private assertLinkProvider(provider: LinkProvider): void {
    if (this.config.get('PAYMENT_TEST_MODE', { infer: true })) return;
    if (!this.checkoutConfigured(provider)) {
      throw new AppError(
        ErrorCode.PAYMENT_PROVIDER_UNAVAILABLE,
        {},
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private checkoutConfigured(provider: PaymentProvider): boolean {
    if (provider === 'PAYME') return Boolean(this.config.get('PAYME_MERCHANT_ID', { infer: true }));
    if (provider === 'CLICK') {
      return Boolean(
        this.config.get('CLICK_SERVICE_ID', { infer: true }) &&
        this.config.get('CLICK_MERCHANT_ID', { infer: true }),
      );
    }
    return false;
  }

  /** Payme checkout (base64 parameters) or the Click payment page for this payment. */
  checkoutUrl(payment: Pick<Payment, 'id' | 'provider' | 'amount'>): string | null {
    if (!this.checkoutConfigured(payment.provider)) return null;
    if (payment.provider === 'PAYME') {
      const params = `m=${this.config.get('PAYME_MERCHANT_ID', { infer: true })};ac.payment_id=${payment.id};a=${payment.amount}`;
      const base = this.config.get('PAYME_CHECKOUT_URL', { infer: true }).replace(/\/$/, '');
      return `${base}/${Buffer.from(params).toString('base64')}`;
    }
    const query = new URLSearchParams({
      service_id: this.config.get('CLICK_SERVICE_ID', { infer: true }) ?? '',
      merchant_id: this.config.get('CLICK_MERCHANT_ID', { infer: true }) ?? '',
      amount: formatSomDecimal(payment.amount),
      transaction_param: payment.id,
    });
    return `https://my.click.uz/services/pay?${query}`;
  }

  private view(payment: Payment): PaymentView {
    const open = payment.status === 'CREATED' || payment.status === 'PENDING';
    return {
      id: payment.id,
      provider: payment.provider,
      purpose: payment.purpose,
      amount: payment.amount.toString(),
      status: payment.status,
      order_id: payment.orderId,
      checkout_url: open ? this.checkoutUrl(payment) : null,
      expires_at: payment.expiresAt.toISOString(),
      test_mode: this.config.get('PAYMENT_TEST_MODE', { infer: true }),
    };
  }

  private publish(payment: Payment): void {
    this.realtime.toUsers([payment.userId, payment.createdBy], 'payment.status', {
      payment_id: payment.id,
      purpose: payment.purpose,
      order_id: payment.orderId,
      status: payment.status,
    });
  }
}
