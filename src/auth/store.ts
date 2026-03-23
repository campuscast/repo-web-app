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

function areStringArraysEqual(left: string[], right: string[]) {
  if (left === right) return true;
  if (left.length !== right.length) return false;

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }

  return true;
}

function isSameUser(left: UserMe['user'] | null, right: UserMe['user']) {
  if (!left) return false;

  return (
    left.id === right.id &&
    left.email === right.email &&
    left.name === right.name &&
    left.must_change_password === right.must_change_password
  );
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'unknown',
  user: null,
  roles: [],
  permissions: [],
  zones: [],
  crdtEnabled: false,
  hydrateFromMe: (me) =>
    set((state) => {
      const nextPermissions = me.permissions || [];
      const isUnchanged =
        state.status === 'authenticated' &&
        state.crdtEnabled === me.crdt_enabled &&
        isSameUser(state.user, me.user) &&
        areStringArraysEqual(state.roles, me.roles) &&
        areStringArraysEqual(state.permissions, nextPermissions) &&
        areStringArraysEqual(state.zones, me.zones);

      if (isUnchanged) {
        return state;
      }

      return {
        status: 'authenticated',
        user: me.user,
        roles: me.roles,
        permissions: nextPermissions,
        zones: me.zones,
        crdtEnabled: me.crdt_enabled
      };
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
