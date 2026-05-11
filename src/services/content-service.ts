import { apiClient } from '@/services/api-client';
import {
  contentAssetSchema,
  contentAssetInfoSchema,
  contentListResponseSchema,
  initUploadRequestSchema,
  initUploadResponseSchema,
  type ContentAsset,
  type ContentAssetInfo,
  type InitUploadRequest
} from '@/types/api';

export const contentService = {
  initUpload: (payload: InitUploadRequest) =>
    apiClient.post('/content/init-upload', initUploadRequestSchema.parse(payload), initUploadResponseSchema),

  uploadBinaryToSignedUrl: async (uploadUrl: string, file: File) => {
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type
      },
      body: file
    });

    if (!response.ok) {
      throw new Error(`Upload failed with status ${response.status}`);
    }
  },

  completeUpload: (assetId: string, sha256Hash: string) =>
    apiClient.post(`/content/${assetId}/complete`, { sha256_hash: sha256Hash }, contentAssetSchema),

  renameAsset: (assetId: string, filename: string) =>
    apiClient.patch<ContentAsset>(`/content/${assetId}`, { filename }, contentAssetSchema),

  getInfo: (assetId: string) =>
    apiClient.get<ContentAssetInfo>(`/content/asset/${assetId}/info`, contentAssetInfoSchema),

  updateAvailability: (assetId: string, zoneIds: string[]) =>
    apiClient.patch<ContentAssetInfo>(`/content/${assetId}/availability`, { zone_ids: zoneIds }, contentAssetInfoSchema),

  pruneUnusedAvailability: (assetId: string) =>
    apiClient.post<ContentAssetInfo>(`/content/${assetId}/availability/prune-unused`, {}, contentAssetInfoSchema),

  deleteAsset: (assetId: string) =>
    apiClient.delete(`/content/${assetId}`),

  listWithUsage: (zone: string | string[]) => {
    const params = new URLSearchParams();
    if (Array.isArray(zone)) {
      if (zone.length > 0) {
        params.set('zone_ids', zone.join(','));
      }
    } else if (zone) {
      params.set('zone_id', zone);
    }

    return apiClient.get<{
      data: ContentAsset[];
      pagination: { total: number; page: number; page_size: number };
      publication_usage_by_asset: Record<string, number>;
    }>(
      `/content?${params.toString()}`,
      contentListResponseSchema
    );
  },

  list: async (zone: string | string[]) => {
    const data = await contentService.listWithUsage(zone);
    return data.data;
  },
};

export type { ContentAsset, ContentAssetInfo };
