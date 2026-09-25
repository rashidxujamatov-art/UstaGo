/**
 * i18next needs Intl.PluralRules, which Hermes may not provide. Each polyfill installs
 * itself only when the native implementation is missing; locale data is added only
 * to the polyfill. Tajik (tg) has no data in @formatjs, but its CLDR plural rules
 * (one / other) are the same as Uzbek and English, so the fallback is correct.
 */
import '@formatjs/intl-locale/polyfill.js';
import '@formatjs/intl-pluralrules/polyfill.js';
import '@formatjs/intl-pluralrules/locale-data/uz.js';
import '@formatjs/intl-pluralrules/locale-data/ru.js';
import '@formatjs/intl-pluralrules/locale-data/en.js';
