import { AuthHydrator } from '@/auth/auth-hydrator';
import type { ReactNode } from 'react';
import { requireServerSession } from '@/auth/server-session';
import { SiteShell } from '@/components/layout/site-shell';

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const session = await requireServerSession();

  return (
    <>
      <AuthHydrator me={session.me} accessToken={session.accessToken} />
      <SiteShell>{children}</SiteShell>
    </>
  );
}
