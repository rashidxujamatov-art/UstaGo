import { randomBytes } from 'node:crypto';
import type { CardBrand } from '../../generated/prisma/client.js';

export const CARD_PROVIDER = Symbol('CARD_PROVIDER');

export type CardErrorKind = 'INVALID' | 'NOT_SUPPORTED' | 'CODE_INVALID' | 'DECLINED';

/** A card provider refusal the user can act on (wrong number, wrong SMS code, decline). */
export class CardError extends Error {
  constructor(readonly kind: CardErrorKind) {
    super(`Card error: ${kind}`);
    this.name = 'CardError';
  }
}

export interface NewCard {
  token: string;
  /** "8600 **** **** 4417". */
  maskedPan: string;
  brand: CardBrand;
}

/**
 * Saved cards and card payments (docs/02-arxitektura.md §9): the card is tokenized by the
 * provider, confirmed with an SMS code, and charged by token. The full number never
 * reaches the database.
 */
export interface CardProvider {
  readonly name: 'mock' | 'payme';
  create(input: { number: string; expire: string }): Promise<NewCard>;
  /** Sends the confirmation SMS; returns the masked phone it went to. */
  sendCode(token: string): Promise<{ phoneMasked: string | null }>;
  verify(token: string, code: string): Promise<void>;
  /** Charges the card; `paymentId` is our payment row. Returns the provider receipt id. */
  charge(input: { token: string; amount: bigint; paymentId: string }): Promise<{
    receiptId: string;
  }>;
  remove(token: string): Promise<void>;
}

/** Card network by its first digits (BIN). */
export function cardBrand(number: string): CardBrand | null {
  if (/^(8600|5614)/.test(number)) return 'UZCARD';
  if (number.startsWith('9860')) return 'HUMO';
  if (number.startsWith('4')) return 'VISA';
  if (/^(5[1-5]|2[2-7])/.test(number)) return 'MASTERCARD';
  return null;
}

export function maskPan(number: string): string {
  return `${number.slice(0, 4)} **** **** ${number.slice(-4)}`;
}

/** Luhn checksum; catches most typing mistakes before the provider is called. */
export function luhnValid(number: string): boolean {
  let sum = 0;
  for (let index = 0; index < number.length; index += 1) {
    let digit = Number(number[number.length - 1 - index]);
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return number.length >= 16 && sum % 10 === 0;
}

/** MM/YY that has not passed yet. */
export function expireValid(expire: string, now = new Date()): boolean {
  const match = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(expire);
  if (!match) return false;
  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  return (
    year > now.getUTCFullYear() || (year === now.getUTCFullYear() && month >= now.getUTCMonth() + 1)
  );
}

/**
 * Local and test stand-in. The SMS code is always 000000; cards ending in 0000 are
 * declined, so the failure path can be tried.
 */
export class MockCardProvider implements CardProvider {
  readonly name = 'mock' as const;

  create(input: { number: string; expire: string }): Promise<NewCard> {
    const brand = cardBrand(input.number);
    if (!brand) return Promise.reject(new CardError('INVALID'));
    return Promise.resolve({
      token: `mock:${input.number.slice(-4)}:${randomBytes(8).toString('hex')}`,
      maskedPan: maskPan(input.number),
      brand,
    });
  }

  sendCode(): Promise<{ phoneMasked: string | null }> {
    return Promise.resolve({ phoneMasked: '+998 ** *** ** 00' });
  }

  verify(_token: string, code: string): Promise<void> {
    return code === '000000' ? Promise.resolve() : Promise.reject(new CardError('CODE_INVALID'));
  }

  charge(input: { token: string; paymentId: string }): Promise<{ receiptId: string }> {
    if (input.token.startsWith('mock:0000:')) return Promise.reject(new CardError('DECLINED'));
    return Promise.resolve({ receiptId: `mock-receipt-${input.paymentId}` });
  }

  remove(): Promise<void> {
    return Promise.resolve();
  }
}
