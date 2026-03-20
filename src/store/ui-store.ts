'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type Locale, normalizeLocale, LOCALE_COOKIE_NAME } from '@/lib/i18n';

function readCookieLocale(): Locale {
  if (typeof document === 'undefined') return 'en';
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${LOCALE_COOKIE_NAME}=([^;]+)`),
  );
  return normalizeLocale(match ? decodeURIComponent(match[1]) : null);
}

type UiState = {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (value: boolean) => void;
  locale: Locale;
  setLocale: (value: Locale) => void;
};

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      setSidebarCollapsed: (value) => set({ sidebarCollapsed: value }),
      locale: readCookieLocale(),
      setLocale: (value) => set({ locale: normalizeLocale(value) }),
    }),
    {
      name: 'campuscast-ui-store',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        locale: state.locale,
      }),
    },
  ),
);
