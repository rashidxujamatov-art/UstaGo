import { createHash } from 'node:crypto';
import {
  IdentityCheckFailedError,
  type IdentityDocument,
  type IdentityProvider,
  type IdentityResult,
} from './identity.provider.js';

const FIRST_NAMES = [
  'Aziza',
  'Bekzod',
  'Dilshod',
  'Gulnora',
  'Jasur',
  'Malika',
  'Otabek',
  'Zarina',
];
const LAST_NAMES = ['Karimov', 'Rahimov', 'Yusupov', 'Tursunov', 'Aliyev', 'Nazarov'];

/**
 * Local/test stand-in for MyID. Stateless: the session id carries the document.
 * The PINFL is derived from the document number, so the same document always gives
 * the same person (handy for testing the duplicate-person screen, K3d).
 * A document number ending in 0000000 simulates a failed check.
 */
export class MockIdentityProvider implements IdentityProvider {
  readonly name = 'mock' as const;

  startSession(document: IdentityDocument): Promise<{ sessionId: string }> {
    const payload = Buffer.from(JSON.stringify(document)).toString('base64url');
    return Promise.resolve({ sessionId: `mock.${payload}` });
  }

  getResult(sessionId: string): Promise<IdentityResult> {
    const document = decode(sessionId);
    if (!document || document.docNumber.endsWith('0000000')) {
      return Promise.reject(new IdentityCheckFailedError('Mock identity check failed'));
    }

    const digest = createHash('sha256').update(document.docNumber).digest();
    const digits = [...digest].map((byte) => (byte % 10).toString()).join('');
    const isMale = (digest[0] ?? 0) % 2 === 0;
    const lastName = LAST_NAMES[(digest[1] ?? 0) % LAST_NAMES.length] ?? 'Karimov';

    return Promise.resolve({
      pinfl: `3${digits.slice(0, 13)}`,
      lastName: isMale ? lastName : `${lastName}a`,
      firstName: FIRST_NAMES[(digest[2] ?? 0) % FIRST_NAMES.length] ?? 'Aziza',
      middleName: null,
      birthDate: document.birthDate,
      reference: `mock-${digits.slice(0, 12)}`,
    });
  }
}

function decode(sessionId: string): IdentityDocument | null {
  if (!sessionId.startsWith('mock.')) return null;
  try {
    return JSON.parse(
      Buffer.from(sessionId.slice(5), 'base64url').toString('utf8'),
    ) as IdentityDocument;
  } catch {
    return null;
  }
}
