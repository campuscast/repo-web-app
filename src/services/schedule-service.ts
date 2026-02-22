import { z } from 'zod';
import { DEFAULT_LOCK_TTL_SECONDS } from '@/lib/constants';
import { apiClient } from '@/services/api-client';
import {
  ingestOpsResponseSchema,
  lockResponseSchema,
  publishResponseSchema,
  scheduleOpSchema,
  scheduleSchema,
  schedulesListResponseSchema,
  validationResultSchema,
  type LockResponse,
  type PublishResponse,
  type Schedule,
  type ScheduleOp,
  type ScheduleSlot,
  type ValidationResult
} from '@/types/api';

const lockReleaseSchema = z.object({ released: z.boolean().optional().default(true) });

export const scheduleService = {
  listSchedules: async (zoneId: string): Promise<Schedule[]> => {
    const data = await apiClient.get<{ data: Schedule[]; pagination: { total: number; page: number; page_size: number } }>(
      `/schedules?zone_id=${encodeURIComponent(zoneId)}`,
      schedulesListResponseSchema
    );
    return data.data;
  },

  createSchedule: (payload: { zone_id: string; name: string }): Promise<Schedule> =>
    apiClient.post('/schedules', payload, scheduleSchema),

  lock: (scheduleId: string, ttlSeconds = DEFAULT_LOCK_TTL_SECONDS): Promise<LockResponse> =>
    apiClient.post(`/schedules/${scheduleId}/lock`, { ttl_seconds: ttlSeconds }, lockResponseSchema),

  unlock: (scheduleId: string, lockToken: string) =>
    apiClient.delete(`/schedules/${scheduleId}/lock`, { lock_token: lockToken }, lockReleaseSchema),

  saveDraft: (scheduleId: string, slots: ScheduleSlot[], lockToken: string): Promise<Schedule> =>
    apiClient.post(`/schedules/${scheduleId}/save`, { slots, lock_token: lockToken }, scheduleSchema),

  validate: (scheduleId: string): Promise<ValidationResult> =>
    apiClient.post(`/schedules/${scheduleId}/validate`, {}, validationResultSchema),

  publish: (
    scheduleId: string,
    versionNumber: number,
    targetGroupIds: string[]
  ): Promise<PublishResponse> =>
    apiClient.post(
      `/schedules/${scheduleId}/publish`,
      { version_number: versionNumber, target_group_ids: targetGroupIds },
      publishResponseSchema
    ),

  ingestOps: (scheduleId: string, ops: ScheduleOp[]) =>
    apiClient.post(
      `/schedules/${scheduleId}/ops`,
      { ops: ops.map((op) => scheduleOpSchema.parse(op)) },
      ingestOpsResponseSchema
    )
};
