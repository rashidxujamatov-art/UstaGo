import { Logger } from '@nestjs/common';
import { maskPhone } from '../../common/phone.js';
import type { SmsProvider } from './sms.provider.js';

export interface SentSms {
  phone: string;
  text: string;
  at: Date;
}

/**
 * Local/test SMS gateway: keeps messages in memory instead of sending them.
 * In development the text is logged so a developer can read the code.
 */
export class MockSmsProvider implements SmsProvider {
  private readonly logger = new Logger('MockSms');
  readonly sent: SentSms[] = [];

  constructor(private readonly logTexts: boolean) {}

  send(phone: string, text: string): Promise<void> {
    this.sent.push({ phone, text, at: new Date() });
    if (this.sent.length > 100) this.sent.shift();
    if (this.logTexts) this.logger.log(`SMS to ${maskPhone(phone)}: ${text}`);
    return Promise.resolve();
  }

  /** Last message sent to a number (tests). */
  lastTo(phone: string): SentSms | undefined {
    return this.sent.findLast((sms) => sms.phone === phone);
  }
}
