import { apiClient } from '@/services/api-client';
import {
  publicationSchema,
  publicationsListResponseSchema,
  type Publication,
  type PublicationItem,
} from '@/types/api';

export const publicationService = {
  list: async (
    zoneId: string,
    params?: {
      status?: string;
      pageSize?: number;
    },
  ) => {
    const query = new URLSearchParams({
      zone_id: zoneId,
      page_size: String(params?.pageSize ?? 100),
    });
    if (params?.status) {
      query.set('status', params.status);
    }
    const response = await apiClient.get(
      `/publications?${query.toString()}`,
      publicationsListResponseSchema,
    );
    return response.data;
  },

  get: (publicationId: string) =>
    apiClient.get(`/publications/${publicationId}`, publicationSchema),

  create: (payload: {
    zone_id: string;
    title: string;
    type?: string;
    status?: string;
    items?: PublicationItem[];
    metadata?: Record<string, unknown>;
  }) => apiClient.post('/publications', payload, publicationSchema),

  copy: (publicationId: string, payload: {
    zone_id: string;
    title: string;
  }) => apiClient.post(`/publications/${publicationId}/copy`, payload, publicationSchema),

  update: (publicationId: string, payload: {
    title?: string;
    type?: string;
    status?: string;
    items?: PublicationItem[];
    metadata?: Record<string, unknown>;
  }) => apiClient.patch(`/publications/${publicationId}`, payload, publicationSchema),

  archive: (publicationId: string) =>
    apiClient.delete(`/publications/${publicationId}`, undefined, publicationSchema),
};

export type { Publication };
