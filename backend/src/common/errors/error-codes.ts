/**
 * Error codes returned to clients as `{ "code": "...", "params": { ... } }`.
 * The backend never returns user-facing text; the mobile app maps each code to
 * an i18n key (mobile/src/api/error-messages.ts). Keep both lists in sync.
 */
export const ErrorCode = {
  // Generic
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  RATE_LIMITED: 'RATE_LIMITED',
  SETTINGS_INVALID: 'SETTINGS_INVALID',

  // Business rules (docs/01-biznes-qoidalar.md)
  AUTH_REFERRAL_REQUIRED: 'AUTH_REFERRAL_REQUIRED',
  AUTH_DUPLICATE_PERSON: 'AUTH_DUPLICATE_PERSON',
  ORDER_NOT_FOUND: 'ORDER_NOT_FOUND',
  ORDER_CUSTOMER_CONFIRMATION_REQUIRED: 'ORDER_CUSTOMER_CONFIRMATION_REQUIRED',
  ORDER_EXECUTOR_CONFIRMATION_REQUIRED: 'ORDER_EXECUTOR_CONFIRMATION_REQUIRED',
  WALLET_INSUFFICIENT_TO_ACCEPT: 'WALLET_INSUFFICIENT_TO_ACCEPT',
  WALLET_INSUFFICIENT_FUNDS: 'WALLET_INSUFFICIENT_FUNDS',
  WALLET_WITHDRAW_EXCEEDS_LIMIT: 'WALLET_WITHDRAW_EXCEEDS_LIMIT',
  TAX_METHOD_REQUIRED: 'TAX_METHOD_REQUIRED',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Error parameters. Money is passed as `bigint` tiyin and serialized as a decimal string. */
export type ErrorParams = Record<string, string | number | boolean | bigint | null>;

/** Wire format of every error response. */
export interface ErrorBody {
  code: ErrorCode;
  params: Record<string, string | number | boolean | null>;
}
