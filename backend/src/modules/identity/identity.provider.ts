import type { DocType } from '../../generated/prisma/client.js';

export interface IdentityDocument {
  docType: DocType;
  /** Series and number, e.g. AD1234567. */
  docNumber: string;
  /** YYYY-MM-DD. */
  birthDate: string;
}

export interface IdentityResult {
  pinfl: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  /** YYYY-MM-DD, as returned by the provider. */
  birthDate: string;
  /** Provider-side reference of the check. */
  reference: string;
}

/**
 * Identity check adapter (docs/02-arxitektura.md §9). The backend opens a session, the
 * mobile SDK checks the document and the face, then the backend reads the result.
 */
export interface IdentityProvider {
  readonly name: 'mock' | 'myid';
  startSession(document: IdentityDocument): Promise<{ sessionId: string }>;
  /** Throws IdentityCheckFailedError when the person could not be verified. */
  getResult(sessionId: string): Promise<IdentityResult>;
}

export class IdentityCheckFailedError extends Error {}

export const IDENTITY_PROVIDER = Symbol('IDENTITY_PROVIDER');
