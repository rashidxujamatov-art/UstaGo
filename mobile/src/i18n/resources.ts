import en from './en.json';
import ru from './ru.json';
import tg from './tg.json';
import uz from './uz.json';
import type { Language } from './languages';

/** Uzbek is the reference locale: every other file must have exactly the same keys. */
export type Translation = typeof uz;

export const resources: Record<Language, { translation: Translation }> = {
  uz: { translation: uz },
  ru: { translation: ru },
  en: { translation: en },
  tg: { translation: tg },
};
