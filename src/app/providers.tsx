'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { Toaster } from '@/components/ui/sonner';
import { SessionHeartbeat } from '@/auth/session-heartbeat';
import { LOCALE_COOKIE_NAME, validateTranslationCoverage } from '@/lib/i18n';
import { useUiStore } from '@/store/ui-store';

type ProvidersProps = {
  children: ReactNode;
};

export function Providers({ children }: ProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 20_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <LocaleSync />
        <SessionHeartbeat />
        {children}
        <Toaster position="bottom-right" />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function LocaleSync() {
  const locale = useUiStore((state) => state.locale);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      validateTranslationCoverage();
    }
    document.documentElement.lang = locale;
    document.cookie = `${LOCALE_COOKIE_NAME}=${locale}; Max-Age=31536000; Path=/; SameSite=Lax`;
  }, [locale]);

  return null;
}
