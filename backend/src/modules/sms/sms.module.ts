import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';
import { EskizSmsProvider } from './eskiz-sms.provider.js';
import { MockSmsProvider } from './mock-sms.provider.js';
import { SMS_PROVIDER } from './sms.provider.js';

@Global()
@Module({
  providers: [
    {
      provide: SMS_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        if (config.get('SMS_PROVIDER', { infer: true }) === 'eskiz') {
          return new EskizSmsProvider({
            email: config.get('ESKIZ_EMAIL', { infer: true }) ?? '',
            password: config.get('ESKIZ_PASSWORD', { infer: true }) ?? '',
            from: config.get('ESKIZ_FROM', { infer: true }) ?? '',
          });
        }
        return new MockSmsProvider(config.get('NODE_ENV', { infer: true }) === 'development');
      },
    },
  ],
  exports: [SMS_PROVIDER],
})
export class SmsModule {}
