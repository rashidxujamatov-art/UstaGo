import { HttpStatus } from '@nestjs/common';
import { ErrorCode, type ErrorParams } from './error-codes.js';

/** Domain error. Carries a stable code and parameters, never a translated message. */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly params: ErrorParams = {},
    readonly status: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super(code);
    this.name = 'AppError';
  }
}
