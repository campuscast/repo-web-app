'use client';

import { useCallback, useMemo } from 'react';
import {
  LOCALE_COOKIE_NAME,
  type Locale,
  getTranslator,
  normalizeLocale,
} from '@/lib/i18n';
import { useUiStore } from '@/store/ui-store';

function writeLocaleCookie(locale: Locale) {
  if (typeof document === 'undefined') return;
  document.cookie = `${LOCALE_COOKIE_NAME}=${locale}; Max-Age=31536000; Path=/; SameSite=Lax`;
}

export function useLocale() {
  const locale = useUiStore((state) => state.locale);
  const setLocale = useUiStore((state) => state.setLocale);

  const t = useMemo(() => getTranslator(locale), [locale]);

  const changeLocale = useCallback(
    (value: string) => {
      const next = normalizeLocale(value);
      setLocale(next);
      writeLocaleCookie(next);
      if (typeof document !== 'undefined') {
        document.documentElement.lang = next;
      }
    },
    [setLocale],
  );

  return { locale, changeLocale, t };
}
