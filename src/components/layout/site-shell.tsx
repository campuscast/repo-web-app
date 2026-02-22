'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, MonitorSmartphone, FileVideo2, CalendarClock, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { env } from '@/lib/env';
import { logout } from '@/services/auth-service';
import { useAuthStore } from '@/auth/store';

const links = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/zones', label: 'Zones', icon: MonitorSmartphone },
  { href: '/admin/devices', label: 'Devices', icon: MonitorSmartphone },
  { href: '/content', label: 'Content', icon: FileVideo2 },
  { href: '/schedules/default', label: 'Schedules', icon: CalendarClock }
];

export function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f8fafc] to-[#f2f5f8]">
      <header className="border-b bg-white/90 backdrop-blur">
        <div className="container flex h-14 items-center justify-between">
          <div className="text-sm font-semibold tracking-wide text-slate-700">{env.appName}</div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">{user?.email}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await logout();
                router.replace('/login');
              }}
            >
              <LogOut className="size-4" />
              Logout
            </Button>
          </div>
        </div>
      </header>
      <div className="container grid grid-cols-1 gap-4 py-6 md:grid-cols-[220px_1fr]">
        <aside className="rounded-lg border bg-white p-2">
          <nav className="flex flex-col gap-1">
            {links.map((link) => {
              const Icon = link.icon;
              const active = pathname === link.href || pathname.startsWith(`${link.href}/`);

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-100',
                    active && 'bg-slate-900 text-slate-100 hover:bg-slate-900'
                  )}
                >
                  <Icon className="size-4" />
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <main>{children}</main>
      </div>
    </div>
  );
}
