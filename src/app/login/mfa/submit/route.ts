import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { tokenPairSchema } from '@/types/api';
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

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const code = String(formData.get('code') || '').trim();
  if (!code) {
    return redirectTo('/login/mfa?error=missing_code');
  }

  const mfaToken = request.cookies.get(MFA_LOGIN_TOKEN_COOKIE)?.value;
  if (!mfaToken) {
    return redirectTo('/login/mfa?error=missing_challenge');
  }

  const verifyResponse = await fetch(
    `${env.backendBaseUrl}/api/v1/auth/mfa/login-verify`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mfa_token: mfaToken, code }),
      cache: 'no-store',
    },
  );

  if (!verifyResponse.ok) {
    return redirectTo('/login/mfa?error=invalid_code');
  }

  const payload = await verifyResponse.json();
  const parsed = tokenPairSchema.safeParse(payload);
  if (!parsed.success) {
    return redirectTo('/login/mfa?error=invalid_response');
  }

  const isSecure = request.headers.get('x-forwarded-proto') === 'https';
  const response = redirectTo('/dashboard');

  response.cookies.set({
    name: ACCESS_TOKEN_COOKIE,
    value: parsed.data.access_token,
    maxAge: parsed.data.expires_in,
    sameSite: 'lax',
    path: '/',
    secure: isSecure,
    httpOnly: true,
  });

  if (parsed.data.refresh_token) {
    response.cookies.set({
      name: REFRESH_TOKEN_COOKIE,
      value: parsed.data.refresh_token,
      sameSite: 'lax',
      path: '/',
      secure: isSecure,
      httpOnly: true,
    });
  }

  response.cookies.set({
    name: CSRF_TOKEN_COOKIE,
    value: randomBytes(32).toString('hex'),
    sameSite: 'lax',
    path: '/',
    secure: isSecure,
    httpOnly: false,
  });

  response.cookies.set({
    name: MFA_LOGIN_TOKEN_COOKIE,
    value: '',
    sameSite: 'lax',
    path: '/',
    secure: isSecure,
    httpOnly: true,
    maxAge: 0,
  });

  return response;
}
