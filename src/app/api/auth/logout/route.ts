import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';

const ACCESS_TOKEN_COOKIE = 'cc_access_token';
const REFRESH_TOKEN_COOKIE = 'refresh_token';
const CSRF_TOKEN_COOKIE = 'csrf_token';

export async function POST(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const csrfToken = request.cookies.get(CSRF_TOKEN_COOKIE)?.value;
  const cookieHeader = request.headers.get('cookie') ?? '';

  try {
    await fetch(`${env.backendBaseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cookieHeader ? { cookie: cookieHeader } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      },
      body: JSON.stringify({}),
      cache: 'no-store',
    });
  } catch {
    // Best effort logout on backend.
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: ACCESS_TOKEN_COOKIE,
    value: '',
    maxAge: 0,
    path: '/',
  });
  response.cookies.set({
    name: REFRESH_TOKEN_COOKIE,
    value: '',
    maxAge: 0,
    path: '/',
  });
  response.cookies.set({
    name: CSRF_TOKEN_COOKIE,
    value: '',
    maxAge: 0,
    path: '/',
  });
  return response;
}
