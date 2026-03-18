import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { loginResponseSchema, tokenPairSchema } from '@/types/api';
import { randomBytes } from 'crypto';

const ACCESS_TOKEN_COOKIE = 'cc_access_token';
const REFRESH_TOKEN_COOKIE = 'refresh_token';
const CSRF_TOKEN_COOKIE = 'csrf_token';
const MFA_LOGIN_TOKEN_COOKIE = 'mfa_login_token';

function redirectTo(path: string) {
  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: path,
    },
  });
}

async function isSystemInitialized(): Promise<boolean> {
  try {
    const response = await fetch(`${env.backendBaseUrl}/api/v1/system/init-state`, {
      method: 'GET',
      cache: 'no-store',
    });
    if (!response.ok) return true;
    const payload = await response.json();
    if (!payload || typeof payload !== 'object') return true;
    return Boolean((payload as { initialized?: boolean; has_admin?: boolean }).initialized) &&
      Boolean((payload as { initialized?: boolean; has_admin?: boolean }).has_admin);
  } catch {
    return true;
  }
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');

  if (!email || !password) {
    return redirectTo('/login?error=missing_credentials');
  }

  const initialized = await isSystemInitialized();
  if (!initialized) {
    return redirectTo('/login?error=not_initialized');
  }

  const loginResponse = await fetch(
    `${env.backendBaseUrl}/api/v1/auth/login`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      cache: 'no-store',
    },
  );

  if (!loginResponse.ok) {
    return redirectTo('/login?error=invalid_credentials');
  }

  const payload = await loginResponse.json();
  const parsed = loginResponseSchema.safeParse(payload);

  if (!parsed.success) {
    return redirectTo('/login?error=invalid_response');
  }

  const isSecure = request.headers.get('x-forwarded-proto') === 'https';

  if ('mfa_required' in parsed.data && parsed.data.mfa_required) {
    const response = redirectTo('/login/mfa');
    response.cookies.set({
      name: MFA_LOGIN_TOKEN_COOKIE,
      value: parsed.data.mfa_token,
      sameSite: 'lax',
      path: '/',
      secure: isSecure,
      httpOnly: true,
      maxAge: parsed.data.expires_in,
    });
    return response;
  }

  const tokenPair = tokenPairSchema.parse(parsed.data);
  const response = redirectTo('/dashboard');
  response.cookies.set({
    name: ACCESS_TOKEN_COOKIE,
    value: tokenPair.access_token,
    maxAge: tokenPair.expires_in,
    sameSite: 'lax',
    path: '/',
    secure: isSecure,
    httpOnly: true,
  });

  if (tokenPair.refresh_token) {
    response.cookies.set({
      name: REFRESH_TOKEN_COOKIE,
      value: tokenPair.refresh_token,
      sameSite: 'lax',
      path: '/',
      secure: isSecure,
      httpOnly: true,
    });
  }

  response.cookies.set({
    name: MFA_LOGIN_TOKEN_COOKIE,
    value: '',
    sameSite: 'lax',
    path: '/',
    secure: isSecure,
    httpOnly: true,
    maxAge: 0,
  });

  response.cookies.set({
    name: CSRF_TOKEN_COOKIE,
    value: randomBytes(32).toString('hex'),
    sameSite: 'lax',
    path: '/',
    secure: isSecure,
    httpOnly: false,
  });

  return response;
}
