import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS } from '../../infra/redis/redis.module.js';
import { AppError } from '../errors/app-error.js';
import { ErrorCode } from '../errors/error-codes.js';

export interface RateLimit {
  /** Redis key suffix, e.g. `otp:phone:+998901234567`. */
  key: string;
  limit: number;
  windowSec: number;
}

/** Fixed-window counters in Redis. Limits and windows come from settings (CLAUDE.md rule 7). */
@Injectable()
export class RateLimiter {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  /** Counts one hit; throws RATE_LIMITED with `retry_after` (seconds) once over the limit. */
  async hit({ key, limit, windowSec }: RateLimit): Promise<void> {
    const count = await this.increment(key, windowSec);
    if (count > limit) await this.reject(key);
  }

  /** Throws RATE_LIMITED if the counter is already at the limit, without counting. */
  async ensureBelow({ key, limit }: RateLimit): Promise<void> {
    const count = Number((await this.redis.get(this.fullKey(key))) ?? 0);
    if (count >= limit) await this.reject(key);
  }

  /** Counts one hit without checking (e.g. a failed password). */
  async increment(key: string, windowSec: number): Promise<number> {
    const fullKey = this.fullKey(key);
    // SET NX starts the window on the first hit; INCR counts it.
    const results = (await this.redis
      .multi()
      .set(fullKey, '0', 'EX', windowSec, 'NX')
      .incr(fullKey)
      .exec()) as [unknown, unknown][];
    return Number(results[1]?.[1]);
  }

  async reset(key: string): Promise<void> {
    await this.redis.del(this.fullKey(key));
  }

  private async reject(key: string): Promise<never> {
    const ttl = await this.redis.ttl(this.fullKey(key));
    throw new AppError(
      ErrorCode.RATE_LIMITED,
      { retry_after: Math.max(ttl, 1) },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private fullKey(key: string): string {
    return `rl:${key}`;
  }
}
