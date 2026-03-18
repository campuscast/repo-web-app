import { apiClient } from '@/services/api-client';
import { mfaSetupSchema, mfaStatusSchema, type MfaSetup, type MfaStatus } from '@/types/api';

export function getMfaStatus(): Promise<MfaStatus> {
  return apiClient.get('/auth/mfa/status', mfaStatusSchema);
}

export function startMfaSetup(): Promise<MfaSetup> {
  return apiClient.post('/auth/mfa/setup', {}, mfaSetupSchema);
}

export function verifyMfaCode(code: string) {
  return apiClient.post<{ ok: boolean; valid: boolean }>('/auth/mfa/verify', { code });
}

export function enableMfa(code: string) {
  return apiClient.post<{ ok: boolean; mfa_enabled: boolean }>('/auth/mfa/enable', { code });
}

export function disableMfa(password: string) {
  return apiClient.post<{ ok: boolean; mfa_enabled: boolean }>('/auth/mfa/disable', { password });
}
