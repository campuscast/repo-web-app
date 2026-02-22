export function getCsrfTokenFromCookie(cookieName = 'csrf_token'): string | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const match = document.cookie.match(new RegExp(`(?:^|; )${cookieName}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}
