import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/**
 * AES-256-GCM for small secrets kept in the database (card tokens).
 * Stored layout: iv (12) | auth tag (16) | ciphertext.
 */
export class SecretBox {
  private readonly key: Buffer;

  constructor(keyBase64: string) {
    this.key = Buffer.from(keyBase64, 'base64');
    if (this.key.length !== 32) throw new Error('SecretBox key must be 32 bytes');
  }

  seal(plain: string): Uint8Array<ArrayBuffer> {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return new Uint8Array(Buffer.concat([iv, cipher.getAuthTag(), ciphertext]));
  }

  open(payload: Uint8Array): string {
    const data = Buffer.from(payload);
    const decipher = createDecipheriv('aes-256-gcm', this.key, data.subarray(0, IV_LENGTH));
    decipher.setAuthTag(data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH));
    return Buffer.concat([
      decipher.update(data.subarray(IV_LENGTH + TAG_LENGTH)),
      decipher.final(),
    ]).toString('utf8');
  }
}
