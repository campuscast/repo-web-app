'use client';

import { create } from 'zustand';
import type { UserMe } from '@/types/api';

type SessionStatus = 'unknown' | 'authenticated' | 'anonymous';

type AuthState = {
  status: SessionStatus;
  user: UserMe['user'] | null;
  roles: string[];
  permissions: string[];
  zones: string[];
  crdtEnabled: boolean;
  hydrateFromMe: (me: UserMe) => void;
  setAnonymous: () => void;
  clear: () => void;
  hasPermission: (permission: string) => boolean;
  hasRole: (role: string) => boolean;
  isAdmin: () => boolean;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'unknown',
  user: null,
  roles: [],
  permissions: [],
  zones: [],
  crdtEnabled: false,
  hydrateFromMe: (me) =>
    set({
      status: 'authenticated',
      user: me.user,
      roles: me.roles,
      permissions: me.permissions || [],
      zones: me.zones,
      crdtEnabled: me.crdt_enabled
    }),
  setAnonymous: () =>
    set({
      status: 'anonymous',
      user: null,
      roles: [],
      permissions: [],
      zones: [],
      crdtEnabled: false
    }),
  clear: () =>
    set({
      status: 'unknown',
      user: null,
      roles: [],
      permissions: [],
      zones: [],
      crdtEnabled: false
    }),
  hasPermission: (permission: string) => {
    const state = get();
    if (state.permissions.includes('*')) return true;
    if (state.roles.includes('admin') || state.roles.includes('super_admin')) return true;
    return state.permissions.includes(permission);
  },
  hasRole: (role: string) => get().roles.includes(role),
  isAdmin: () => {
    const state = get();
    return state.roles.includes('admin') || state.roles.includes('super_admin');
  },
}));
