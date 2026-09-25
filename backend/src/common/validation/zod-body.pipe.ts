import { type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { AppError } from '../errors/app-error.js';
import { ErrorCode } from '../errors/error-codes.js';

/**
 * Validates a request body/param with a zod schema.
 * Errors become VALIDATION_FAILED with the list of bad fields, never a message text.
 */
export class ZodPipe<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const fields = [
        ...new Set(result.error.issues.map((issue) => issue.path.join('.') || '(root)')),
      ];
      throw new AppError(ErrorCode.VALIDATION_FAILED, { fields: fields.join(',') });
    }
    return result.data;
  }
}
