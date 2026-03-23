import { z } from 'zod';
import { DEFAULT_LOCK_TTL_SECONDS } from '@/lib/constants';
import { apiClient } from '@/services/api-client';
import {
  scheduleCalendarResponseSchema,
  scheduleDayViewSchema,
  ingestOpsResponseSchema,
  lockResponseSchema,
  publishResponseSchema,
  scheduleUsageSchema,
  scheduleOpSchema,
  signOpsResponseSchema,
  scheduleSchema,
  schedulesListResponseSchema,
  validationResultSchema,
  type LockResponse,
  type PublishResponse,
  type ScheduleCalendarResponse,
  type ScheduleDayView,
  type Schedule,
  type ScheduleOp,
  type SignedScheduleOp,
  type ScheduleSlot,
  type ScheduleUsage,
  type ValidationResult
} from '@/types/api';

const lockReleaseSchema = z.object({ released: z.boolean().optional().default(true) });

export const scheduleService = {
  listSchedules: async (zoneId: string, params?: { group_id?: string }): Promise<Schedule[]> => {
    const query = new URLSearchParams({ zone_id: zoneId });
    if (params?.group_id) query.set('group_id', params.group_id);
    const data = await apiClient.get<{ data: Schedule[]; pagination: { total: number; page: number; page_size: number } }>(
      `/schedules?${query.toString()}`,
      schedulesListResponseSchema
    );
    return data.data;
  },

  createSchedule: (payload: { zone_id: string; name: string }): Promise<Schedule> =>
    apiClient.post('/schedules', payload, scheduleSchema),

  getSchedule: (scheduleId: string): Promise<Schedule> =>
    apiClient.get(`/schedules/${scheduleId}`, scheduleSchema),

  getCalendar: (
    scheduleId: string,
    params: { view: 'day' | 'week' | 'month' | 'year'; date?: string; from?: string; to?: string }
  ): Promise<ScheduleCalendarResponse> => {
    const query = new URLSearchParams({ view: params.view });
    if (params.date) query.set('date', params.date);
    if (params.from) query.set('from', params.from);
    if (params.to) query.set('to', params.to);
    return apiClient.get(`/schedules/${scheduleId}/calendar?${query.toString()}`, scheduleCalendarResponseSchema);
  },

  getDay: (scheduleId: string, date: string): Promise<ScheduleDayView> =>
    apiClient.get(`/schedules/${scheduleId}/day?date=${encodeURIComponent(date)}`, scheduleDayViewSchema),

  saveDay: (
    scheduleId: string,
    payload: { date: string; slots: ScheduleSlot[]; lock_token?: string }
  ): Promise<ScheduleDayView> =>
    apiClient.post(`/schedules/${scheduleId}/day`, payload, scheduleDayViewSchema),

  getUsage: (zoneId: string): Promise<ScheduleUsage> =>
    apiClient.get(`/schedules/usage?zone_id=${encodeURIComponent(zoneId)}`, scheduleUsageSchema),

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
    ),

  signOps: (scheduleId: string, ops: ScheduleOp[]): Promise<SignedScheduleOp[]> =>
    apiClient
      .post(
        `/schedules/${scheduleId}/ops/sign`,
        { ops: ops.map((op) => scheduleOpSchema.parse(op)) },
        signOpsResponseSchema
      )
      .then((result) => result.ops)
};
