import { LANGUAGES } from '../languages';
import { resources } from '../resources';

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((all, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string'
      ? { ...all, [path]: value }
      : { ...all, ...flatten(value, path) };
  }, {});
}

const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();

const flat = Object.fromEntries(
  LANGUAGES.map((language) => [language, flatten(resources[language].translation as Tree)]),
);
const reference = flat.uz!;

describe.each(LANGUAGES.filter((language) => language !== 'uz'))('%s translation', (language) => {
  const translation = flat[language]!;

  it('has exactly the same keys as uz', () => {
    expect(Object.keys(translation).sort()).toEqual(Object.keys(reference).sort());
  });

  it('uses the same {placeholders} in every message', () => {
    for (const [key, text] of Object.entries(reference)) {
      expect({ key, placeholders: placeholders(translation[key] ?? '') }).toEqual({
        key,
        placeholders: placeholders(text),
      });
    }
  });
});

describe.each(LANGUAGES)('%s translation', (language) => {
  const entries = Object.entries(flat[language]!);

  it('has no empty messages and no double-brace placeholders', () => {
    for (const [key, text] of entries) {
      expect({ key, empty: text.trim() === '' }).toEqual({ key, empty: false });
      expect({ key, doubleBrace: text.includes('{{') }).toEqual({ key, doubleBrace: false });
    }
  });

  it('never hard-codes the brand name (use {appName})', () => {
    for (const [key, text] of entries) {
      expect({ key, brand: /\bGTM\b|UstaGo/i.test(text) }).toEqual({ key, brand: false });
    }
  });
});
