import type { TFunction } from 'i18next';
import type { Language } from '../i18n/languages';
import { formatAmount } from '../lib/format';

/**
 * Backend error codes (backend/src/common/errors/error-codes.ts). The backend returns
 * `{ code, params }` only; the text is chosen here in the user's language.
 */
export const ERROR_MESSAGE_KEYS = {
  INTERNAL_ERROR: 'errors.internal',
  VALIDATION_FAILED: 'errors.validation',
  NOT_FOUND: 'errors.notFound',
  UNAUTHORIZED: 'errors.unauthorized',
  FORBIDDEN: 'errors.forbidden',
  RATE_LIMITED: 'errors.rateLimited',
  SETTINGS_INVALID: 'errors.internal',
  AUTH_REFERRAL_REQUIRED: 'auth.referralRequired',
  AUTH_DUPLICATE_PERSON: 'auth.duplicatePerson',
  ORDER_NOT_FOUND: 'order.notFound',
  ORDER_CUSTOMER_CONFIRMATION_REQUIRED: 'order.customerConfirmRequired',
  ORDER_EXECUTOR_CONFIRMATION_REQUIRED: 'order.executorConfirmRequired',
  WALLET_INSUFFICIENT_TO_ACCEPT: 'wallet.insufficientToAccept',
  WALLET_INSUFFICIENT_FUNDS: 'wallet.insufficientFunds',
  WALLET_WITHDRAW_EXCEEDS_LIMIT: 'wallet.withdrawMustKeep',
  TAX_METHOD_REQUIRED: 'tax.required',
} as const;

export type ErrorCode = keyof typeof ERROR_MESSAGE_KEYS;

export interface ApiErrorBody {
  code: string;
  params?: Record<string, string | number | boolean | null>;
}

/** Parameters that carry money (tiyin strings) and must be shown as formatted amounts. */
const MONEY_PARAMS = new Set(['shortfall', 'must_keep', 'max', 'fee']);

function isErrorCode(code: string): code is ErrorCode {
  return Object.hasOwn(ERROR_MESSAGE_KEYS, code);
}

/** Translates an API error. Unknown codes fall back to the generic message. */
export function errorMessage(error: ApiErrorBody, t: TFunction, language: Language): string {
  if (!isErrorCode(error.code)) return t('errors.internal');

  const params = Object.fromEntries(
    Object.entries(error.params ?? {}).map(([name, value]) => [
      name,
      MONEY_PARAMS.has(name) && (typeof value === 'string' || typeof value === 'number')
        ? formatAmount(BigInt(value), language)
        : value,
    ]),
  );
  return t(ERROR_MESSAGE_KEYS[error.code], params);
}
