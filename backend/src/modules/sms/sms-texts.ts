import type { Language } from '../../generated/prisma/client.js';

/**
 * SMS templates. SMS is the one place where the backend itself writes user-facing
 * text, so it keeps the four languages here. Eskiz may require the templates to be
 * approved in advance (docs/02-arxitektura.md §9).
 */
const OTP_TEXT: Record<Language, string> = {
  uz: '{appName}: tasdiqlash kodi {code}. Uni hech kimga aytmang.',
  ru: '{appName}: код подтверждения {code}. Никому его не сообщайте.',
  en: '{appName}: your verification code is {code}. Do not share it with anyone.',
  tg: '{appName}: рамзи тасдиқ {code}. Онро ба касе нагӯед.',
};

export function otpSmsText(language: Language, appName: string, code: string): string {
  return OTP_TEXT[language].replace('{appName}', appName).replace('{code}', code);
}
