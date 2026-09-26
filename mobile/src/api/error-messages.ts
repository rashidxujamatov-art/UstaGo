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
  NETWORK: 'errors.network',
  AUTH_REFERRAL_REQUIRED: 'auth.referralRequired',
  AUTH_REFERRAL_INVALID: 'auth.referralInvalid',
  AUTH_PHONE_TAKEN: 'auth.phoneTaken',
  AUTH_EMAIL_TAKEN: 'auth.emailTaken',
  AUTH_WEAK_PASSWORD: 'auth.weakPassword',
  AUTH_OTP_INVALID: 'otp.invalid',
  AUTH_OTP_EXPIRED: 'otp.expired',
  AUTH_OTP_TOO_EARLY: 'otp.tooEarly',
  AUTH_INVALID_CREDENTIALS: 'auth.invalidCredentials',
  AUTH_SESSION_INVALID: 'errors.unauthorized',
  AUTH_IDENTITY_REQUIRED: 'identity.required',
  AUTH_IDENTITY_ALREADY_VERIFIED: 'identity.alreadyVerified',
  AUTH_IDENTITY_FAILED: 'identity.failed',
  AUTH_AGE_RESTRICTED: 'identity.ageRestricted',
  AUTH_DUPLICATE_PERSON: 'auth.duplicatePerson',
  USER_BLOCKED: 'errorsExtra.userBlocked',
  UPLOAD_INVALID: 'errorsExtra.uploadInvalid',
  ORDER_ROLE_REQUIRED: 'errorsExtra.roleRequired',
  ORDER_OWN: 'errorsExtra.ownOrder',
  ORDER_NOT_AVAILABLE: 'errorsExtra.notAvailable',
  ORDER_STATUS_CONFLICT: 'errorsExtra.statusConflict',
  ORDER_TIME_INVALID: 'errorsExtra.timeInvalid',
  ORDER_CATEGORY_INVALID: 'errorsExtra.categoryInvalid',
  ORDER_PAYMENT_METHOD_DISABLED: 'errorsExtra.paymentDisabled',
  ORDER_CANCEL_REASON_REQUIRED: 'errorsExtra.cancelReasonRequired',
  CHAT_NOT_AVAILABLE: 'errorsExtra.chatClosed',
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
const MONEY_PARAMS = new Set(['shortfall', 'required', 'available', 'must_keep', 'max', 'fee']);

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
