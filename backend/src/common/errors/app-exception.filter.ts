import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { AppError } from './app-error.js';
import { type ErrorBody, ErrorCode, type ErrorParams } from './error-codes.js';

const STATUS_CODES: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.VALIDATION_FAILED,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.RATE_LIMITED,
};

/** Serializes params for JSON: bigint money becomes a decimal string of tiyin. */
export function serializeParams(params: ErrorParams): ErrorBody['params'] {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => [
      key,
      typeof value === 'bigint' ? value.toString() : value,
    ]),
  );
}

/** Maps any thrown value to `{ code, params }`. Internal details never reach the client. */
export function toErrorResponse(exception: unknown): { status: number; body: ErrorBody } {
  if (exception instanceof AppError) {
    return {
      status: exception.status,
      body: { code: exception.code, params: serializeParams(exception.params) },
    };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const code =
      STATUS_CODES[status] ??
      (status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.VALIDATION_FAILED);
    return { status, body: { code, params: {} } };
  }
  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    body: { code: ErrorCode.INTERNAL_ERROR, params: {} },
  };
}

@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AppExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const { status, body } = toErrorResponse(exception);
    if (status >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }
    host.switchToHttp().getResponse<Response>().status(status).json(body);
  }
}
