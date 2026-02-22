import { z } from 'zod';
import { apiClient } from '@/services/api-client';
import {
  deviceSchema,
  registerDeviceRequestSchema,
  registerDeviceResponseSchema,
  type Device,
  type RegisterDeviceRequest,
  type RegisterDeviceResponse
} from '@/types/api';

const devicesListSchema = z.object({
  data: z.array(deviceSchema).default([])
});

export const deviceService = {
  getDevice: (deviceId: string): Promise<Device> => apiClient.get(`/devices/${deviceId}`, deviceSchema),

  register: (payload: RegisterDeviceRequest): Promise<RegisterDeviceResponse> => {
    const parsed = registerDeviceRequestSchema.parse(payload);
    return apiClient.post('/devices/register', parsed, registerDeviceResponseSchema);
  },

  assign: (deviceId: string, groupId: string): Promise<Device> =>
    apiClient.put(`/devices/${deviceId}/assign`, { group_id: groupId }, deviceSchema),

  // Not present in OpenAPI yet; keeps UI ready for future /devices listing endpoint.
  listByZone: async (zoneId: string): Promise<Device[]> => {
    const data = await apiClient.get<{ data: Device[] }>(
      `/devices?zone_id=${encodeURIComponent(zoneId)}`,
      devicesListSchema
    );
    return data.data;
  }
};
