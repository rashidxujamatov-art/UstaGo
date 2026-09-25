import { IdentityCheckFailedError } from './identity.provider.js';
import { MockIdentityProvider } from './mock-identity.provider.js';

describe('MockIdentityProvider', () => {
  const provider = new MockIdentityProvider();
  const run = async (docNumber: string) => {
    const { sessionId } = await provider.startSession({
      docType: 'ID_CARD',
      docNumber,
      birthDate: '1987-05-12',
    });
    return provider.getResult(sessionId);
  };

  it('returns the same 14-digit PINFL for the same document (duplicate testing)', async () => {
    const first = await run('AD1234567');
    const again = await run('AD1234567');
    const other = await run('AB7654321');

    expect(first.pinfl).toMatch(/^\d{14}$/);
    expect(again.pinfl).toBe(first.pinfl);
    expect(other.pinfl).not.toBe(first.pinfl);
    expect(first.birthDate).toBe('1987-05-12');
  });

  it('fails for document numbers ending in 0000000', async () => {
    await expect(run('AA0000000')).rejects.toBeInstanceOf(IdentityCheckFailedError);
  });

  it('rejects unknown session ids', async () => {
    await expect(provider.getResult('not-a-session')).rejects.toBeInstanceOf(
      IdentityCheckFailedError,
    );
  });
});
