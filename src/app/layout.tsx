import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Noto_Sans } from 'next/font/google';
import './globals.css';
import { Providers } from '@/app/providers';
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
        url: '/cms-icon-light.svg',
        type: 'image/svg+xml',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/cms-icon-dark.svg',
        type: 'image/svg+xml',
        media: '(prefers-color-scheme: dark)',
      },
    ],
    shortcut: '/cms-icon-light.svg',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={notoSans.variable} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
