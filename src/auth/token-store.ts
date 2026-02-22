let accessToken: string | null = null;
let accessTokenExpiresAt = 0;

export function getAccessToken() {
  return accessToken;
}

export function getAccessTokenExpiresAt() {
  return accessTokenExpiresAt;
}

export function setAccessToken(token: string, expiresInSeconds = 900) {
  accessToken = token;
  accessTokenExpiresAt = Date.now() + expiresInSeconds * 1000;
}

export function clearAccessToken() {
  accessToken = null;
  accessTokenExpiresAt = 0;
}
