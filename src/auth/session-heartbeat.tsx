'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { fetchMe } from '@/services/auth-service';

const HEARTBEAT_INTERVAL_MS = 5_000;

export function SessionHeartbeat() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname?.startsWith('/login')) return;

    const tick = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }

      try {
        await fetchMe();
      } catch {
        // Auth failures are handled centrally by api-client.
      }
    };

    void tick();
    const timer = window.setInterval(() => {
      void tick();
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [pathname]);

  return null;
}
