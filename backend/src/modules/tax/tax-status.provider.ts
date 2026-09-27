export const TAX_STATUS_PROVIDER = Symbol('TAX_STATUS_PROVIDER');

export type TaxCheck =
  | { status: 'VERIFIED'; validUntil: Date }
  /** Not found or the service is down: the request goes to the admin queue (AD1). */
  | { status: 'MANUAL' };

/**
 * Self-employed status in the state tax system, by PINFL (docs/01-biznes-qoidalar.md §9).
 * There is no public API yet, so the real adapter is "manual": every request is checked
 * by an admin from the uploaded certificate.
 */
export interface TaxStatusProvider {
  checkSelfEmployed(pinfl: string): Promise<TaxCheck>;
}

export class ManualTaxStatusProvider implements TaxStatusProvider {
  checkSelfEmployed(): Promise<TaxCheck> {
    return Promise.resolve({ status: 'MANUAL' });
  }
}

/**
 * Local stand-in: verifies until the end of the current year; a PINFL ending in 0 is
 * "not found", so the certificate path can be tried.
 */
export class MockTaxStatusProvider implements TaxStatusProvider {
  checkSelfEmployed(pinfl: string): Promise<TaxCheck> {
    if (pinfl.endsWith('0')) return Promise.resolve({ status: 'MANUAL' });
    const year = new Date().getUTCFullYear();
    // 31 December, 23:59 in Tashkent (UTC+5).
    return Promise.resolve({
      status: 'VERIFIED',
      validUntil: new Date(Date.UTC(year, 11, 31, 18, 59)),
    });
  }
}
