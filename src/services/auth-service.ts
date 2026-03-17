import { apiClient } from '@/services/api-client';
import {
  tokenPairSchema,
  userMeSchema,
  type TokenPair,
  type UserMe
} from '@/types/api';
import { useAuthStore } from '@/auth/store';
import { env } from '@/lib/env';
import { getCsrfTokenFromCookie } from '@/auth/csrf';

type LoginCredentials = {
  email: string;
  password: string;
};

export async function fetchMe(): Promise<UserMe> {
  const me = await apiClient.get('/me', userMeSchema).catch(() => null);

  if (me) {
    useAuthStore.getState().hydrateFromMe(me);
    return me;
  }

  throw new Error('Unauthenticated');
}

export async function login(credentials: LoginCredentials): Promise<UserMe> {
  // Login via API — tokens will be set as httpOnly cookies by the server
  await apiClient.post<TokenPair>('/auth/login', credentials, tokenPairSchema);
  const me = await fetchMe();
  return me;
}

export async function refreshAccessToken(): Promise<TokenPair | null> {
  const csrfToken = getCsrfTokenFromCookie();
  const response = await fetch(`${env.apiPrefix}/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {})
    },
    credentials: 'include',
    body: JSON.stringify({ refresh_token: '' })
  });

  if (!response.ok) {
    useAuthStore.getState().setAnonymous();
    return null;
  }

  const json = await response.json();
  const parsed = tokenPairSchema.safeParse(json);

  if (!parsed.success) {
    useAuthStore.getState().setAnonymous();
    return null;
  }

  return parsed.data;
}

export async function logout() {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
  } catch {
    // Best-effort
  }

  useAuthStore.getState().clear();
}
