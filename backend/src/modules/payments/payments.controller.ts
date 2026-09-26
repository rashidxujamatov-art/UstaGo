import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { Auth, type AuthContext, Public } from '../../common/auth/auth.decorators.js';
import { ZodPipe } from '../../common/validation/zod-body.pipe.js';
import { CardsService } from './cards.service.js';
import { ClickShopHandler } from './click.handler.js';
import { PaymeMerchantHandler } from './payme.handler.js';
import { PaymentsService } from './payments.service.js';
import { PayoutsService } from './payouts.service.js';

const uuid = new ParseUUIDPipe();
/** Whole so'm in tiyin, as a string (money never travels as a JSON number). */
const tiyin = z
  .string()
  .regex(/^[1-9]\d{0,14}00$/)
  .transform((value) => BigInt(value));

const topupSchema = z.object({
  amount: tiyin,
  method: z.enum(['CLICK', 'PAYME', 'CARD']),
  card_id: z.uuid().optional(),
});
const payOrderSchema = z.object({ card_id: z.uuid().optional() });
const cardSchema = z.object({
  number: z.string().regex(/^[\d ]{16,23}$/),
  expire: z.string().regex(/^\d{2}\/\d{2}$/),
});
const cardCodeSchema = z.object({ code: z.string().regex(/^\d{4,8}$/) });
const withdrawPreviewSchema = z.object({ amount: tiyin.optional() });
const withdrawSchema = z.object({
  amount: tiyin,
  card_id: z.uuid(),
  idempotency_key: z.string().min(8).max(64),
});

/**
 * Provider callbacks (docs/02-arxitektura.md §6 "Callback"). Public, but every call is
 * authenticated by the provider's key or signature inside the handler (CLAUDE.md rule 4).
 * Both providers expect HTTP 200 with their own error format.
 */
@Public()
@Controller('payments')
export class PaymentCallbacksController {
  constructor(
    private readonly payme: PaymeMerchantHandler,
    private readonly click: ClickShopHandler,
  ) {}

  @Post('payme')
  @HttpCode(HttpStatus.OK)
  paymeRpc(@Headers('authorization') authorization: string | undefined, @Body() body: unknown) {
    return this.payme.handle(authorization, body);
  }

  @Post('click/prepare')
  @HttpCode(HttpStatus.OK)
  clickPrepare(@Body() body: Record<string, unknown>) {
    return this.click.prepare(body ?? {});
  }

  @Post('click/complete')
  @HttpCode(HttpStatus.OK)
  clickComplete(@Body() body: Record<string, unknown>) {
    return this.click.complete(body ?? {});
  }
}

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** Status of a top-up or order payment (the app also gets `payment.status` events). */
  @Get(':id')
  get(@Auth() auth: AuthContext, @Param('id', uuid) id: string) {
    return this.payments.get(auth.userId, id);
  }

  /** PAYMENT_TEST_MODE (development) only. */
  @Post(':id/test-complete')
  @HttpCode(HttpStatus.OK)
  testComplete(@Auth() auth: AuthContext, @Param('id', uuid) id: string) {
    return this.payments.testComplete(auth.userId, id);
  }
}

@Controller('orders')
export class OrderPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** BY5: pay a finished job with its payment method (balance, card, Click, Payme). */
  @Post(':id/pay')
  @HttpCode(HttpStatus.OK)
  pay(
    @Auth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(payOrderSchema)) body: z.output<typeof payOrderSchema>,
  ) {
    return this.payments.payOrder(auth.userId, id, body.card_id);
  }

  /** BJ4: the executor's Click / Payme QR for this job. */
  @Post(':id/payment-session')
  @HttpCode(HttpStatus.OK)
  session(@Auth() auth: AuthContext, @Param('id', uuid) id: string) {
    return this.payments.orderQr(auth.userId, id);
  }
}

@Controller('wallet')
export class WalletPaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly cards: CardsService,
    private readonly payouts: PayoutsService,
  ) {}

  /** BJ6. */
  @Post('topup')
  @HttpCode(HttpStatus.OK)
  topup(
    @Auth() auth: AuthContext,
    @Body(new ZodPipe(topupSchema)) body: z.output<typeof topupSchema>,
  ) {
    return this.payments.topup(auth.userId, {
      amount: body.amount,
      method: body.method,
      cardId: body.card_id,
    });
  }

  @Get('cards')
  listCards(@Auth() auth: AuthContext) {
    return this.cards.list(auth.userId);
  }

  /** Adds a card and sends the confirmation SMS. */
  @Post('cards')
  addCard(
    @Auth() auth: AuthContext,
    @Body(new ZodPipe(cardSchema)) body: z.output<typeof cardSchema>,
  ) {
    return this.cards.add(auth.userId, body);
  }

  @Post('cards/:id/verify')
  @HttpCode(HttpStatus.OK)
  verifyCard(
    @Auth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(cardCodeSchema)) body: z.output<typeof cardCodeSchema>,
  ) {
    return this.cards.verify(auth.userId, id, body.code);
  }

  @Delete('cards/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeCard(@Auth() auth: AuthContext, @Param('id', uuid) id: string) {
    return this.cards.remove(auth.userId, id);
  }

  /** BJ7: the limit, the reserved fees and the bank fee (§7). */
  @Post('withdraw/preview')
  @HttpCode(HttpStatus.OK)
  withdrawPreview(
    @Auth() auth: AuthContext,
    @Body(new ZodPipe(withdrawPreviewSchema)) body: z.output<typeof withdrawPreviewSchema>,
  ) {
    return this.payouts.preview(auth.userId, body.amount);
  }

  @Post('withdraw')
  withdraw(
    @Auth() auth: AuthContext,
    @Body(new ZodPipe(withdrawSchema)) body: z.output<typeof withdrawSchema>,
  ) {
    return this.payouts.request(auth.userId, {
      amount: body.amount,
      cardId: body.card_id,
      idempotencyKey: body.idempotency_key,
    });
  }
}
