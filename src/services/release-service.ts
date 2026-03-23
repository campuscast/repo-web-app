import { apiClient } from '@/services/api-client';
import {
  releaseManifestSummarySchema,
  releasesListResponseSchema,
  scheduleReleaseSchema,
  type ReleaseManifestSummary,
  type ScheduleRelease,
} from '@/types/api';

type ReleaseFilters = {
  schedule_id?: string;
  zone_id?: string;
  status?: string;
  published_from?: string;
  published_to?: string;
  page?: number;
  page_size?: number;
};

export const releaseService = {
  list: async (filters: ReleaseFilters) => {
    const params = new URLSearchParams();
    if (filters.schedule_id) params.set('schedule_id', filters.schedule_id);
    if (filters.zone_id) params.set('zone_id', filters.zone_id);
    if (filters.status) params.set('status', filters.status);
    if (filters.published_from) params.set('published_from', filters.published_from);
    if (filters.published_to) params.set('published_to', filters.published_to);
    params.set('page', String(filters.page || 1));
    params.set('page_size', String(filters.page_size || 20));
    return apiClient.get<{ data: ScheduleRelease[]; pagination: { total: number; page: number; page_size: number } }>(
      `/releases?${params.toString()}`,
      releasesListResponseSchema,
    );
  },

  get: (releaseId: string): Promise<ScheduleRelease> =>
    apiClient.get(`/releases/${releaseId}`, scheduleReleaseSchema),

  getManifestSummary: (releaseId: string): Promise<ReleaseManifestSummary> =>
    apiClient.get(`/releases/${releaseId}/manifest-summary`, releaseManifestSummarySchema),

  delete: (releaseId: string): Promise<{ deleted: boolean; release_id: string }> =>
    apiClient.delete(`/releases/${releaseId}`),
};
