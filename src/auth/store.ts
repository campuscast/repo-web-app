'use client';

import { create } from 'zustand';
import type { UserMe } from '@/types/api';

type SessionStatus = 'unknown' | 'authenticated' | 'anonymous';

type AuthState = {
  status: SessionStatus;
  user: UserMe['user'] | null;
  roles: string[];
  zones: string[];
  crdtEnabled: boolean;
  hydrateFromMe: (me: UserMe) => void;
  setAnonymous: () => void;
  clear: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  status: 'unknown',
  user: null,
  roles: [],
  zones: [],
  crdtEnabled: false,
  hydrateFromMe: (me) =>
    set({
      status: 'authenticated',
      user: me.user,
      roles: me.roles,
      zones: me.zones,
      crdtEnabled: me.crdt_enabled
    }),
  setAnonymous: () =>
    set({
      status: 'anonymous',
      user: null,
      roles: [],
      zones: [],
      crdtEnabled: false
    }),
  clear: () =>
    set({
      status: 'unknown',
      user: null,
      roles: [],
      zones: [],
      crdtEnabled: false
    })
}));
