import type { ReactNode } from 'react';
import { AuthHydrator } from '@/auth/auth-hydrator';
import { requireServerSession } from '@/auth/server-session';
import { AppShell } from '@/components/layout/app-shell';

export default async function ProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await requireServerSession();

  return (
    <>
      <AuthHydrator me={session.me} accessToken={session.accessToken} />
      <AppShell>{children}</AppShell>
    </>
  );
}
