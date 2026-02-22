import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { Providers } from '@/app/providers';
import { env } from '@/lib/env';

export const metadata: Metadata = {
  title: env.appName,
  description: 'Distributed Media CMS Web UI'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
