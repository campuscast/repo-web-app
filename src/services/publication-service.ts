import { apiClient } from '@/services/api-client';
import {
  publicationSchema,
  publicationsListResponseSchema,
  type Publication,
  type PublicationItem,
} from '@/types/api';

export const publicationService = {
  list: async (zoneId: string) => {
    const response = await apiClient.get(
      `/publications?zone_id=${encodeURIComponent(zoneId)}`,
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
