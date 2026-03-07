import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/health'];
const ACCESS_TOKEN_COOKIE = 'cc_access_token';
const REFRESH_TOKEN_COOKIE = 'refresh_token';

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next();
  }

  const hasAccessCookie = request.cookies.has(ACCESS_TOKEN_COOKIE);
  const hasRefreshCookie = request.cookies.has(REFRESH_TOKEN_COOKIE);
  const hasAuthCookie = hasAccessCookie || hasRefreshCookie;

  if (!hasAuthCookie && !isPublicPath(pathname)) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};
