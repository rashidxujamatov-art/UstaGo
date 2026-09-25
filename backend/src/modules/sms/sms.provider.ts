/** SMS gateway adapter (docs/02-arxitektura.md §9). */
export interface SmsProvider {
  /** Sends a text to an E.164 number. Throws on any failure — never continues silently. */
  send(phone: string, text: string): Promise<void>;
}

export const SMS_PROVIDER = Symbol('SMS_PROVIDER');
