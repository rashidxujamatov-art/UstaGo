import { HttpStatus, NotFoundException } from '@nestjs/common';
import { AppError } from './app-error.js';
import { toErrorResponse } from './app-exception.filter.js';
import { ErrorCode } from './error-codes.js';

describe('toErrorResponse', () => {
  it('returns the code and params of a domain error, money as a tiyin string', () => {
    const error = new AppError(ErrorCode.WALLET_INSUFFICIENT_TO_ACCEPT, {
      shortfall: 1_550_000n,
    });

    expect(toErrorResponse(error)).toEqual({
      status: HttpStatus.BAD_REQUEST,
      body: { code: 'WALLET_INSUFFICIENT_TO_ACCEPT', params: { shortfall: '1550000' } },
    });
  });

  it('maps framework HTTP errors to generic codes', () => {
    expect(toErrorResponse(new NotFoundException('Cannot GET /x'))).toEqual({
      status: HttpStatus.NOT_FOUND,
      body: { code: 'NOT_FOUND', params: {} },
    });
  });

  it('hides unknown errors behind INTERNAL_ERROR', () => {
    expect(toErrorResponse(new Error('db password is wrong'))).toEqual({
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { code: 'INTERNAL_ERROR', params: {} },
    });
  });
});
