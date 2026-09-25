import { Global, Module } from '@nestjs/common';
import { RateLimiter } from './rate-limit/rate-limiter.service.js';

/** Cross-cutting services available everywhere. */
@Global()
@Module({
  providers: [RateLimiter],
  exports: [RateLimiter],
})
export class CommonModule {}
