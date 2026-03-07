let accessToken: string | null = null;
let accessTokenExpiresAt = 0;
const ACCESS_TOKEN_COOKIE = 'cc_access_token';

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|; )${escapedName}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name: string, value: string, expiresInSeconds = 900) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${Math.max(0, Math.floor(expiresInSeconds))}; Path=/; SameSite=Lax`;
}

function clearCookie(name: string) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
}

export function getAccessToken() {
  if (!accessToken) {
    accessToken = readCookie(ACCESS_TOKEN_COOKIE);
  }
  return accessToken;
}

export function getAccessTokenExpiresAt() {
  return accessTokenExpiresAt;
}

export function setAccessToken(token: string, expiresInSeconds = 900) {
  accessToken = token;
  accessTokenExpiresAt = Date.now() + expiresInSeconds * 1000;
  writeCookie(ACCESS_TOKEN_COOKIE, token, expiresInSeconds);
}

export function clearAccessToken() {
  accessToken = null;
  accessTokenExpiresAt = 0;
  clearCookie(ACCESS_TOKEN_COOKIE);
}
