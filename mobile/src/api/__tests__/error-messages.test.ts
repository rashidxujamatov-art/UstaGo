import { createInstance } from 'i18next';
import { LANGUAGES, type Language } from '../../i18n/languages';
import { resources } from '../../i18n/resources';
import { GROUP_SEPARATOR as S } from '../../lib/format';
import { ERROR_MESSAGE_KEYS, errorMessage } from '../error-messages';

async function translator(language: Language) {
  const i18n = createInstance();
  await i18n.init({
    resources,
    lng: language,
    interpolation: { prefix: '{', suffix: '}', escapeValue: false },
  });
  return i18n.t;
}

describe('errorMessage', () => {
  it.each(LANGUAGES)('has a translation for every backend error code in %s', async (language) => {
    const t = await translator(language);
    for (const key of Object.values(ERROR_MESSAGE_KEYS)) {
      expect(t(key)).not.toBe(key);
    }
  });

  it('formats money params from tiyin strings (docs/01 §4, §15)', async () => {
    const t = await translator('uz');
    expect(
      errorMessage(
        { code: 'WALLET_INSUFFICIENT_TO_ACCEPT', params: { shortfall: '1550000' } },
        t,
        'uz',
      ),
    ).toBe(`Bu ishni olish uchun yana 15${S}500 so‘m to‘ldiring.`);
  });

  it('fills every placeholder of the withdraw limit message (T7)', async () => {
    const t = await translator('en');
    expect(
      errorMessage(
        {
          code: 'WALLET_WITHDRAW_EXCEEDS_LIMIT',
          params: { must_keep: '1500000', max: '60000000', fee: '600000' },
        },
        t,
        'en',
      ),
    ).toBe(
      '15,000 UZS must stay in your balance for the app service fee. ' +
        'You can withdraw up to 600,000 UZS (1% bank transfer fee: 6,000 UZS).',
    );
  });

  it('keeps non-money params as they are', async () => {
    const t = await translator('ru');
    expect(
      errorMessage(
        { code: 'ORDER_CUSTOMER_CONFIRMATION_REQUIRED', params: { order: 1031 } },
        t,
        'ru',
      ),
    ).toContain('(#1031)');
  });

  it('falls back to the generic message for unknown codes', async () => {
    const t = await translator('uz');
    expect(errorMessage({ code: 'SOMETHING_NEW' }, t, 'uz')).toBe(t('errors.internal'));
  });
});
