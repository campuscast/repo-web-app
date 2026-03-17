'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/auth/store';
import type { UserMe } from '@/types/api';

type AuthHydratorProps = {
  me: UserMe;
};

export function AuthHydrator({ me }: AuthHydratorProps) {
  const hydrateFromMe = useAuthStore((state) => state.hydrateFromMe);

  useEffect(() => {
    hydrateFromMe(me);
  }, [hydrateFromMe, me]);

  return null;
}
