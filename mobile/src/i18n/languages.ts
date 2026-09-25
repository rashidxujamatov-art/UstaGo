/** Supported UI languages (docs/01-biznes-qoidalar.md §2): Uzbek (Latin), Russian, English, Tajik. */
export const LANGUAGES = ['uz', 'ru', 'en', 'tg'] as const;
export type Language = (typeof LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = 'uz';

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

/** Picks the first supported language from the device's preferred language codes. */
export function pickLanguage(
  deviceLanguageCodes: readonly (string | null | undefined)[],
): Language {
  for (const code of deviceLanguageCodes) {
    const base = code?.toLowerCase().split(/[-_]/)[0];
    if (isLanguage(base)) return base;
  }
  return DEFAULT_LANGUAGE;
}
