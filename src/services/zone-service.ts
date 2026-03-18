import { apiClient } from '@/services/api-client';
import {
  screenGroupSchema,
  zonePolicySchema,
  zonesListResponseSchema,
  zoneSchema,
  type ScreenGroup,
  type Zone,
  type ZonePolicy
} from '@/types/api';

const screenGroupsSchema = screenGroupSchema.array();

export const zoneService = {
  listZones: async () => {
    const data = await apiClient.get<{ data: Zone[]; pagination: { total: number; page: number; page_size: number } }>(
      '/zones',
      zonesListResponseSchema
    );
    return data.data;
  },

  createZone: (payload: { name: string; description?: string }) =>
    apiClient.post('/zones', payload, zoneSchema),

  updateZone: (zoneId: string, payload: { name?: string; description?: string }) =>
    apiClient.put(`/zones/${zoneId}`, payload, zoneSchema),

  deleteZone: (zoneId: string) =>
    apiClient.delete<{ deleted: boolean }>(`/zones/${zoneId}`),

  getPolicy: (zoneId: string) => apiClient.get(`/zones/${zoneId}/policy`, zonePolicySchema),

  setPolicy: (
    zoneId: string,
    policy: Partial<ZonePolicy> & Pick<ZonePolicy, 'zone_id'>
  ) => apiClient.put(`/zones/${zoneId}/policy`, zonePolicySchema.parse(policy), zonePolicySchema),

  listGroups: (zoneId: string): Promise<ScreenGroup[]> =>
    apiClient.get(`/zones/${zoneId}/groups`, screenGroupsSchema),

  createGroup: (zoneId: string, payload: { name: string }) =>
    apiClient.post(`/zones/${zoneId}/groups`, payload, screenGroupSchema),

  deleteGroup: (zoneId: string, groupId: string) =>
    apiClient.delete<{ deleted: boolean }>(`/zones/${zoneId}/groups/${groupId}`)
};

export type { Zone };
