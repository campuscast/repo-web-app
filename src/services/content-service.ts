import { apiClient } from '@/services/api-client';
import {
  contentAssetSchema,
  contentListResponseSchema,
  initUploadRequestSchema,
  initUploadResponseSchema,
  type ContentAsset,
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

  deleteAsset: (assetId: string) =>
    apiClient.delete(`/content/${assetId}`),

  list: async (zoneId: string) => {
    const data = await apiClient.get<{ data: ContentAsset[]; pagination: { total: number; page: number; page_size: number } }>(
      `/content?zone_id=${encodeURIComponent(zoneId)}`,
      contentListResponseSchema
    );

    return data.data;
  }
};

export type { ContentAsset };
