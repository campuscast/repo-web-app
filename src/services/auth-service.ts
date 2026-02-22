import { decodeJwt } from 'jose';
import { apiClient } from '@/services/api-client';
import {
  tokenPairSchema,
  userMeSchema,
  type TokenPair,
  type UserMe
} from '@/types/api';
import {
  clearAccessToken,
  getAccessToken,
  setAccessToken
} from '@/auth/token-store';
import { useAuthStore } from '@/auth/store';
import { env } from '@/lib/env';

const loginSchema = tokenPairSchema;

type LoginCredentials = {
  email: string;
  password: string;
};

function meFallbackFromToken(token: string): UserMe {
  const decoded = decodeJwt(token);
  const roles = Array.isArray(decoded.roles) ? decoded.roles.map(String) : [];
  const zones = Array.isArray(decoded.zone_ids) ? decoded.zone_ids.map(String) : [];

  return {
    user: {
      id: typeof decoded.sub === 'string' ? decoded.sub : 'unknown',
      email: typeof decoded.email === 'string' ? decoded.email : 'unknown@example.com',
      name: typeof decoded.name === 'string' ? decoded.name : undefined
    },
    roles,
    zones,
    crdt_enabled: false
  };
}

export async function fetchMe(): Promise<UserMe> {
  const token = getAccessToken();
  const me = await apiClient.get('/me', userMeSchema).catch(() => null);

  if (me) {
    useAuthStore.getState().hydrateFromMe(me);
    return me;
  }

  if (!token) {
    throw new Error('Unauthenticated');
  }

  const fallback = meFallbackFromToken(token);
  useAuthStore.getState().hydrateFromMe(fallback);
  return fallback;
}

export async function login(credentials: LoginCredentials): Promise<UserMe> {
  const tokenPair = await apiClient.post<TokenPair>('/auth/login', credentials, loginSchema);

  setAccessToken(tokenPair.access_token, tokenPair.expires_in);
  const me = await fetchMe();
  return me;
}

export async function refreshAccessToken(): Promise<TokenPair | null> {
  const response = await fetch(`${env.apiPrefix}/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify({ refresh_token: '' })
  });

  if (!response.ok) {
    clearAccessToken();
    useAuthStore.getState().setAnonymous();
    return null;
  }

  const json = await response.json();
  const parsed = tokenPairSchema.safeParse(json);

  if (!parsed.success) {
    clearAccessToken();
    useAuthStore.getState().setAnonymous();
    return null;
  }

  setAccessToken(parsed.data.access_token, parsed.data.expires_in);
  return parsed.data;
}

export async function logout() {
  try {
    await apiClient.post<void>('/auth/logout', {}, undefined);
  } catch {
    // Best-effort logout call; local cleanup is required either way.
  }

  clearAccessToken();
  useAuthStore.getState().clear();
}
