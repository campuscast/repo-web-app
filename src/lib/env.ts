const env = {
  appName: process.env.NEXT_PUBLIC_APP_NAME || 'CampusCast CMS',
  apiPrefix: process.env.NEXT_PUBLIC_API_PREFIX || '/api/v1',
  wsSyncUrl: process.env.NEXT_PUBLIC_WS_SYNC_URL || 'ws://localhost/ws/sync',
  backendBaseUrl: process.env.BACKEND_BASE_URL || 'http://localhost'
} as const;

export { env };
