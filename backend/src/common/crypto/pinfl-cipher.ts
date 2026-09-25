import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/**
 * PINFL protection (CLAUDE.md rule 9, docs/02-arxitektura.md §10):
 * AES-256-GCM for storage and HMAC-SHA256 for duplicate lookups.
 * Stored layout: iv (12) | auth tag (16) | ciphertext.
 */
export class PinflCipher {
  private readonly encKey: Buffer;

  constructor(
    encKeyBase64: string,
    private readonly hmacKey: string,
  ) {
    this.encKey = Buffer.from(encKeyBase64, 'base64');
    if (this.encKey.length !== 32) throw new Error('PINFL_ENC_KEY must be 32 bytes');
  }

  encrypt(pinfl: string): Buffer {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv('aes-256-gcm', this.encKey, iv);
    const ciphertext = Buffer.concat([cipher.update(pinfl, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
  }

  decrypt(payload: Uint8Array): string {
    const data = Buffer.from(payload);
    const decipher = createDecipheriv('aes-256-gcm', this.encKey, data.subarray(0, IV_LENGTH));
    decipher.setAuthTag(data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH));
    return Buffer.concat([
      decipher.update(data.subarray(IV_LENGTH + TAG_LENGTH)),
      decipher.final(),
    ]).toString('utf8');
  }

  /** Deterministic keyed hash: equal PINFLs give equal hashes, the PINFL cannot be read back. */
  hash(pinfl: string): string {
    return createHmac('sha256', this.hmacKey).update(pinfl).digest('hex');
  }
}
