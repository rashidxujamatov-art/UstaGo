import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SecretBox } from '../../common/crypto/secret-box.js';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type { Env } from '../../config/env.js';
import type { Card } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import {
  CARD_PROVIDER,
  CardError,
  type CardProvider,
  expireValid,
  luhnValid,
} from './card.provider.js';

export interface CardView {
  id: string;
  masked_pan: string;
  last4: string;
  brand: string;
  expire: string;
}

/** Errors of the card provider as API error codes. */
export function cardErrorCode(error: CardError): AppError {
  switch (error.kind) {
    case 'NOT_SUPPORTED':
      return new AppError(ErrorCode.CARD_NOT_SUPPORTED);
    case 'CODE_INVALID':
      return new AppError(ErrorCode.CARD_CODE_INVALID);
    case 'DECLINED':
      return new AppError(ErrorCode.CARD_DECLINED, {}, HttpStatus.PAYMENT_REQUIRED);
    default:
      return new AppError(ErrorCode.CARD_INVALID);
  }
}

/**
 * Saved bank cards (BY5, BJ6, BJ7). A card is added with its number and expiry, confirmed
 * with the SMS code the provider sends, and then used by token. Tokens are encrypted.
 */
@Injectable()
export class CardsService {
  private readonly box: SecretBox;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(CARD_PROVIDER) private readonly provider: CardProvider,
    config: ConfigService<Env, true>,
  ) {
    this.box = new SecretBox(config.get('CARD_TOKEN_ENC_KEY', { infer: true }));
  }

  async list(userId: string): Promise<CardView[]> {
    const cards = await this.prisma.card.findMany({
      where: { userId, verifiedAt: { not: null }, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return cards.map(view);
  }

  /** Step 1: tokenizes the card and sends the SMS code. */
  async add(
    userId: string,
    input: { number: string; expire: string },
  ): Promise<{ card_id: string; phone_masked: string | null }> {
    const number = input.number.replace(/\D/g, '');
    if (!luhnValid(number) || !expireValid(input.expire)) {
      throw new AppError(ErrorCode.CARD_INVALID);
    }
    try {
      const created = await this.provider.create({ number, expire: input.expire });
      const { phoneMasked } = await this.provider.sendCode(created.token);
      const card = await this.prisma.card.create({
        data: {
          userId,
          provider: this.provider.name,
          tokenEnc: this.box.seal(created.token),
          maskedPan: created.maskedPan,
          brand: created.brand,
          expire: input.expire,
        },
      });
      return { card_id: card.id, phone_masked: phoneMasked };
    } catch (error) {
      if (error instanceof CardError) throw cardErrorCode(error);
      throw error;
    }
  }

  /** Step 2: the SMS code; the card is then offered for payments and payouts. */
  async verify(userId: string, cardId: string, code: string): Promise<CardView> {
    const card = await this.find(userId, cardId, false);
    try {
      await this.provider.verify(this.box.open(card.tokenEnc), code);
    } catch (error) {
      if (error instanceof CardError) throw cardErrorCode(error);
      throw error;
    }
    const verified = await this.prisma.card.update({
      where: { id: card.id },
      data: { verifiedAt: new Date() },
    });
    await this.audit.log({
      actorId: userId,
      actorType: 'USER',
      action: 'card.add',
      entityType: 'card',
      entityId: card.id,
      data: { brand: card.brand, last4: card.maskedPan.slice(-4) },
    });
    return view(verified);
  }

  async remove(userId: string, cardId: string): Promise<void> {
    const card = await this.find(userId, cardId, true);
    await this.provider.remove(this.box.open(card.tokenEnc)).catch(() => undefined);
    await this.prisma.card.update({ where: { id: card.id }, data: { deletedAt: new Date() } });
  }

  /** A verified card of the user and its provider token, for a charge or a payout. */
  async token(userId: string, cardId: string): Promise<{ card: Card; token: string }> {
    const card = await this.find(userId, cardId, true);
    return { card, token: this.box.open(card.tokenEnc) };
  }

  async charge(input: { token: string; amount: bigint; paymentId: string }) {
    return this.provider.charge(input);
  }

  private async find(userId: string, cardId: string, verified: boolean): Promise<Card> {
    const card = await this.prisma.card.findFirst({
      where: { id: cardId, userId, deletedAt: null },
    });
    if (!card || (verified && !card.verifiedAt)) {
      throw new AppError(ErrorCode.CARD_NOT_FOUND, {}, HttpStatus.NOT_FOUND);
    }
    return card;
  }
}

function view(card: Card): CardView {
  return {
    id: card.id,
    masked_pan: card.maskedPan,
    last4: card.maskedPan.slice(-4),
    brand: card.brand,
    expire: card.expire,
  };
}
