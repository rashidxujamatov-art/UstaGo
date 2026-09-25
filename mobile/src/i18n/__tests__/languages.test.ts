import { pickLanguage } from '../languages';

describe('pickLanguage', () => {
  it('takes the first supported device language', () => {
    expect(pickLanguage(['de', 'ru-RU', 'en'])).toBe('ru');
    expect(pickLanguage(['tg_TJ'])).toBe('tg');
  });

  it('falls back to Uzbek', () => {
    expect(pickLanguage(['de', null, undefined])).toBe('uz');
    expect(pickLanguage([])).toBe('uz');
  });
});
