import { type Href, router } from 'expo-router';

/** Back to the previous screen, or to `fallback` when the screen was opened directly. */
export function leave(fallback: Href): void {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
