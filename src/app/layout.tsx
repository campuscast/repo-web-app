import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { Noto_Sans } from 'next/font/google';
import './globals.css';
import { Providers } from '@/app/providers';
import { LOCALE_COOKIE_NAME, normalizeLocale } from '@/lib/i18n';
import { env } from '@/lib/env';

const notoSans = Noto_Sans({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: env.appName,
  description: 'Distributed Media CMS Web UI',
  icons: {
    icon: [
      {
        url: '/new-cms-logo.svg',
        type: 'image/svg+xml',
      },
    ],
    shortcut: '/new-cms-logo.svg',
  },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = normalizeLocale(
    (await cookies()).get(LOCALE_COOKIE_NAME)?.value,
  );
  return (
    <html lang={locale} className={notoSans.variable} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
