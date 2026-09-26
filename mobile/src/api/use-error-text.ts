import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { usePreferences } from '../store/preferences';
import { ApiError } from './client';
import { errorMessage } from './error-messages';

/** Turns any thrown value into a message in the current language. */
export function useErrorText(): (error: unknown) => string {
  const { t } = useTranslation();
  const language = usePreferences((state) => state.language);
  return useCallback(
    (error: unknown) =>
      error instanceof ApiError
        ? errorMessage({ code: error.code, params: error.params }, t, language)
        : t('errors.internal'),
    [t, language],
  );
}
