import { z } from 'zod';
import { apiClient } from '@/services/api-client';
import {
  devicePreviewSchema,
  deviceSchema,
  registerDeviceRequestSchema,
  registerDeviceResponseSchema,
  createPendingDeviceResponseSchema,
  activationResponseSchema,
  type Device,
  type RegisterDeviceRequest,
  type RegisterDeviceResponse,
  type CreatePendingRequest,
  type CreatePendingDeviceResponse,
  type UpdateDeviceRequest,
  type ActivationResponse,
  type DevicePreview
} from '@/types/api';

const devicesListSchema = z.object({
  data: z.array(deviceSchema).default([])
});

export const deviceService = {
  getDevice: (deviceId: string): Promise<Device> => apiClient.get(`/devices/${deviceId}`, deviceSchema),

  getPreview: (deviceId: string): Promise<DevicePreview> =>
    apiClient.get(`/devices/${deviceId}/preview`, devicePreviewSchema),

  /** Legacy: register + activate in one call. */
  register: (payload: RegisterDeviceRequest): Promise<RegisterDeviceResponse> => {
    const parsed = registerDeviceRequestSchema.parse(payload);
    return apiClient.post('/devices/register', parsed, registerDeviceResponseSchema);
  },

  /** Create pending device (status='pending', no token issued). */
  createPending: (payload: CreatePendingRequest): Promise<CreatePendingDeviceResponse> =>
    apiClient.post('/enrollment/create', payload, createPendingDeviceResponseSchema),

  /** Update device fields (name, type). */
  updateDevice: (deviceId: string, updates: UpdateDeviceRequest): Promise<Device> =>
    apiClient.patch(`/devices/${deviceId}`, updates, deviceSchema),

  /** Activate device by activation code. */
  activateByCode: (deviceId: string, activationCode: string): Promise<ActivationResponse> =>
    apiClient.post('/enrollment/activate-by-code', { device_id: deviceId, activation_code: activationCode }, activationResponseSchema),

  /** Activate device by MAC address. */
  activateByMac: (deviceId: string, hardwareId: string): Promise<ActivationResponse> =>
    apiClient.post('/enrollment/activate-by-mac', { device_id: deviceId, hardware_id: hardwareId }, activationResponseSchema),

  assign: (deviceId: string, groupId: string): Promise<Device> =>
    apiClient.put(`/devices/${deviceId}/assign`, { group_id: groupId }, deviceSchema),

  /** Permanently delete a device. */
  deleteDevice: (deviceId: string): Promise<{ success: boolean }> =>
    apiClient.delete(`/devices/${deviceId}`),

  listByZone: async (zoneId: string): Promise<Device[]> => {
    const data = await apiClient.get<{ data: Device[] }>(
      `/devices?zone_id=${encodeURIComponent(zoneId)}`,
      devicesListSchema
    );
    return data.data;
  }
};
