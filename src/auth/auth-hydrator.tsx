'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/auth/store';
import { setAccessToken } from '@/auth/token-store';
import type { UserMe } from '@/types/api';

type AuthHydratorProps = {
  me: UserMe;
  accessToken?: string;
};

export function AuthHydrator({ me, accessToken }: AuthHydratorProps) {
  const hydrateFromMe = useAuthStore((state) => state.hydrateFromMe);

  useEffect(() => {
    hydrateFromMe(me);

    if (accessToken) {
      setAccessToken(accessToken);
    }
  }, [accessToken, hydrateFromMe, me]);

  return null;
}
