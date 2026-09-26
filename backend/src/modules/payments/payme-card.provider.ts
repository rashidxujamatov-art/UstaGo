import { type CardProvider, CardError, cardBrand, maskPan, type NewCard } from './card.provider.js';

type Fetch = typeof fetch;

interface RpcError {
  code: number;
  message?: unknown;
}

/**
 * Payme Subscribe API (cards.* and receipts.*): tokenizes Uzcard / Humo cards and charges
 * them. Visa and Mastercard are not supported by it. Front-end methods authenticate with
 * the merchant id, back-end methods with "id:key" (X-Auth header).
 *
 * Needs a check in the Payme sandbox before real use: receipts paid this way may also
 * reach /payments/payme; both paths finish the same payment row, so either order is safe.
 */
export class PaymeCardProvider implements CardProvider {
  readonly name = 'payme' as const;

  constructor(
    private readonly config: { url: string; merchantId: string; key: string },
    private readonly fetchFn: Fetch = fetch,
  ) {}

  async create(input: { number: string; expire: string }): Promise<NewCard> {
    const brand = cardBrand(input.number);
    if (!brand) throw new CardError('INVALID');
    if (brand === 'VISA' || brand === 'MASTERCARD') throw new CardError('NOT_SUPPORTED');
    const result = await this.call<{ card: { token: string } }>(
      'cards.create',
      { card: { number: input.number, expire: input.expire.replace('/', '') }, save: true },
      false,
      'INVALID',
    );
    return { token: result.card.token, maskedPan: maskPan(input.number), brand };
  }

  async sendCode(token: string): Promise<{ phoneMasked: string | null }> {
    const result = await this.call<{ phone?: string }>(
      'cards.get_verify_code',
      { token },
      false,
      'INVALID',
    );
    return { phoneMasked: result.phone ?? null };
  }

  async verify(token: string, code: string): Promise<void> {
    await this.call('cards.verify', { token, code }, false, 'CODE_INVALID');
  }

  async charge(input: { token: string; amount: bigint; paymentId: string }): Promise<{
    receiptId: string;
  }> {
    const created = await this.call<{ receipt: { _id: string } }>(
      'receipts.create',
      { amount: Number(input.amount), account: { payment_id: input.paymentId } },
      true,
      'DECLINED',
    );
    const paid = await this.call<{ receipt: { _id: string; state: number } }>(
      'receipts.pay',
      { id: created.receipt._id, token: input.token },
      true,
      'DECLINED',
    );
    // 4 = paid (Payme receipt states).
    if (paid.receipt.state !== 4) throw new CardError('DECLINED');
    return { receiptId: paid.receipt._id };
  }

  async remove(token: string): Promise<void> {
    await this.call('cards.remove', { token }, true, 'INVALID');
  }

  /** One JSON-RPC call; a Payme error becomes a CardError of `onError` kind. */
  private async call<T>(
    method: string,
    params: Record<string, unknown>,
    backend: boolean,
    onError: CardError['kind'],
  ): Promise<T> {
    const response = await this.fetchFn(this.config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Auth': backend ? `${this.config.merchantId}:${this.config.key}` : this.config.merchantId,
      },
      // Tiyin amounts stay far below 2^53, so JSON numbers are exact here.
      body: JSON.stringify({ id: Date.now(), method, params }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Payme ${method}: HTTP ${response.status}`);
    const body = (await response.json()) as { result?: T; error?: RpcError };
    if (body.error) throw new CardError(onError);
    if (body.result === undefined) throw new Error(`Payme ${method}: empty result`);
    return body.result;
  }
}
