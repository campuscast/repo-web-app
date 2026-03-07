import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { tokenPairSchema } from '@/types/api';

const ACCESS_TOKEN_COOKIE = 'cc_access_token';
const REFRESH_TOKEN_COOKIE = 'refresh_token';

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
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');

  if (!email || !password) {
    return redirectTo('/login?error=missing_credentials');
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
  const parsed = tokenPairSchema.safeParse(payload);

  if (!parsed.success) {
    return redirectTo('/login?error=invalid_response');
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
    httpOnly: false,
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

  return response;
}
