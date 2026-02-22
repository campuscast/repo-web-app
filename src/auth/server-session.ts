import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { decodeJwt } from 'jose';
import { env } from '@/lib/env';
import { tokenPairSchema, userMeSchema, type UserMe } from '@/types/api';

export type ServerSession = {
  me: UserMe;
  accessToken?: string;
};

async function fetchMe(cookieHeader: string, accessToken?: string) {
  const res = await fetch(`${env.backendBaseUrl}/api/v1/me`, {
    method: 'GET',
    headers: {
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
    },
    cache: 'no-store'
  });

  if (!res.ok) {
    return null;
  }

  const json = await res.json();
  return userMeSchema.safeParse(json).success ? userMeSchema.parse(json) : null;
}

function fallbackMeFromAccessToken(accessToken: string): UserMe | null {
  try {
    const decoded = decodeJwt(accessToken);
    const sub = typeof decoded.sub === 'string' ? decoded.sub : 'unknown';
    const email = typeof decoded.email === 'string' ? decoded.email : 'unknown@example.com';
    const name = typeof decoded.name === 'string' ? decoded.name : email;
    const roles = Array.isArray(decoded.roles) ? decoded.roles.map(String) : [];
    const zones = Array.isArray(decoded.zone_ids) ? decoded.zone_ids.map(String) : [];

    return {
      user: { id: sub, email, name },
      roles,
      zones,
      crdt_enabled: false
    };
  } catch {
    return null;
  }
}

async function refreshAccessToken(cookieHeader: string) {
  const res = await fetch(`${env.backendBaseUrl}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookieHeader ? { cookie: cookieHeader } : {})
    },
    // cookie-based refresh first; some envs still require body refresh_token.
    body: JSON.stringify({ refresh_token: '' }),
    cache: 'no-store'
  });

  if (!res.ok) {
    return null;
  }

  const json = await res.json();
  const parsed = tokenPairSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

export async function getServerSession(): Promise<ServerSession | null> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${encodeURIComponent(cookie.value)}`)
    .join('; ');

  const me = await fetchMe(cookieHeader);
  if (me) {
    return { me };
  }

  const refreshed = await refreshAccessToken(cookieHeader);
  if (!refreshed?.access_token) {
    return null;
  }

  const refreshedMe = await fetchMe(cookieHeader, refreshed.access_token);
  if (refreshedMe) {
    return { me: refreshedMe, accessToken: refreshed.access_token };
  }

  const fallbackMe = fallbackMeFromAccessToken(refreshed.access_token);
  return fallbackMe ? { me: fallbackMe, accessToken: refreshed.access_token } : null;
}

export async function requireServerSession(): Promise<ServerSession> {
  const session = await getServerSession();

  if (!session) {
    redirect('/login');
  }

  return session;
}
