import { z } from 'zod';

export const paginationSchema = z.object({
  total: z.number().int().nonnegative().default(0),
  page: z.number().int().nonnegative().default(1),
  page_size: z.number().int().positive().default(20)
});

export const tokenPairSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.number().int().positive().default(900)
});

export const userMeSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string().email(),
    name: z.string().optional()
  }),
  roles: z.array(z.string()).default([]),
  zones: z.array(z.string()).default([]),
  crdt_enabled: z.boolean().default(false)
});

export const zoneSchema = z.object({
  zone_id: z.string(),
  name: z.string(),
  description: z.string().default(''),
  created_at: z.string().default('')
});

export const screenGroupSchema = z.object({
  group_id: z.string(),
  zone_id: z.string(),
  name: z.string(),
  created_at: z.string().default('')
});

export const zonePolicySchema = z.object({
  id: z.string().default(''),
  zone_id: z.string(),
  max_schedule_slots: z.number().int().default(500),
  max_content_size_mb: z.number().int().default(512),
  allowed_content_types: z.array(z.string()).default([]),
  crdt_enabled: z.boolean().default(false),
  max_ops_per_minute: z.number().int().default(300),
  max_batch_size: z.number().int().default(100),
  priority_rules: z.array(z.record(z.string(), z.unknown())).default([]),
  updated_at: z.string().default('')
});

export const zonesListResponseSchema = z.object({
  data: z.array(zoneSchema).default([]),
  pagination: paginationSchema.default({ total: 0, page: 1, page_size: 20 })
});

export const deviceSchema = z.object({
  device_id: z.string(),
  device_name: z.string(),
  device_type: z.string(),
  zone_id: z.string(),
  group_id: z.string(),
  status: z.enum(['pending', 'active', 'revoked', 'offline'])
});

export const registerDeviceRequestSchema = z.object({
  device_name: z.string().min(1),
  device_type: z.enum(['android_tv', 'desktop', 'web']),
  hardware_id: z.string().optional(),
  zone_id: z.string().min(1),
  group_id: z.string().min(1)
});

export const registerDeviceResponseSchema = z.object({
  device_id: z.string(),
  device_token: z.string(),
  mqtt_client_id: z.string(),
  mqtt_topic_prefix: z.string()
});

export const initUploadRequestSchema = z.object({
  zone_id: z.string().min(1),
  filename: z.string().min(1),
  content_type: z.string().min(1),
  file_size: z.number().int().positive()
});

export const initUploadResponseSchema = z.object({
  asset_id: z.string(),
  upload_url: z.string().url(),
  expires_at: z.string()
});

export const contentAssetSchema = z.object({
  asset_id: z.string(),
  zone_id: z.string(),
  filename: z.string(),
  content_type: z.string(),
  file_size: z.number().int().nonnegative(),
  sha256_hash: z.string(),
  status: z.enum(['uploading', 'ready', 'deleted']),
  signature: z.string().default(''),
  key_id: z.string().default('')
});

export const contentListResponseSchema = z.object({
  data: z.array(contentAssetSchema).default([]),
  pagination: paginationSchema.default({ total: 0, page: 1, page_size: 20 })
});

export const scheduleSlotSchema = z.object({
  slot_id: z.string(),
  asset_id: z.string(),
  start_time: z.string(),
  end_time: z.string(),
  priority: z.number().int(),
  zone_id: z.string(),
  group_id: z.string().default('')
});

export const scheduleSchema = z.object({
  schedule_id: z.string(),
  zone_id: z.string(),
  name: z.string(),
  status: z.enum(['draft', 'locked', 'published']),
  current_version: z.number().int().default(1),
  slots: z.array(scheduleSlotSchema).default([])
});

export const schedulesListResponseSchema = z.object({
  data: z.array(scheduleSchema).default([]),
  pagination: paginationSchema.default({ total: 0, page: 1, page_size: 20 })
});

export const lockResponseSchema = z.object({
  acquired: z.boolean(),
  lock_token: z.string().default(''),
  locked_by: z.string().default(''),
  expires_at: z.string().default('')
});

export const scheduleOpSchema = z.object({
  op_type: z.enum(['add_slot', 'remove_slot', 'update_slot', 'move_slot']),
  causal: z.object({
    operation_id: z.string(),
    client_id: z.string(),
    lamport_ts: z.number().int(),
    vector_clock: z.record(z.string(), z.number()).optional(),
    parent_op_id: z.string().optional(),
    session_id: z.string().optional()
  }),
  signature: z
    .object({
      signature: z.string().optional(),
      key_id: z.string().optional(),
      algorithm: z.string().optional()
    })
    .optional(),
  slot: scheduleSlotSchema
});

export const ingestOpsResponseSchema = z.object({
  accepted: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  results: z
    .array(
      z.object({
        operation_id: z.string(),
        accepted: z.boolean(),
        reason: z.string().default(''),
        explanation: z.string().default('')
      })
    )
    .default([])
});

export const validationIssueSchema = z.object({
  severity: z.enum(['error', 'warning', 'info']),
  code: z.string(),
  message: z.string(),
  slot_id: z.string().default('')
});

export const validationResultSchema = z.object({
  valid: z.boolean(),
  has_fatal: z.boolean(),
  issues: z.array(validationIssueSchema).default([])
});

export const publishResponseSchema = z.object({
  release_id: z.string().default(''),
  validation_passed: z.boolean(),
  issues: z.array(validationIssueSchema).default([]),
  rollout_status: z.enum(['pending', 'rolling_out', 'active', 'failed']).default('pending')
});

export type TokenPair = z.infer<typeof tokenPairSchema>;
export type UserMe = z.infer<typeof userMeSchema>;
export type Zone = z.infer<typeof zoneSchema>;
export type ScreenGroup = z.infer<typeof screenGroupSchema>;
export type ZonePolicy = z.infer<typeof zonePolicySchema>;
export type Device = z.infer<typeof deviceSchema>;
export type RegisterDeviceRequest = z.infer<typeof registerDeviceRequestSchema>;
export type RegisterDeviceResponse = z.infer<typeof registerDeviceResponseSchema>;
export type InitUploadRequest = z.infer<typeof initUploadRequestSchema>;
export type InitUploadResponse = z.infer<typeof initUploadResponseSchema>;
export type ContentAsset = z.infer<typeof contentAssetSchema>;
export type Schedule = z.infer<typeof scheduleSchema>;
export type ScheduleSlot = z.infer<typeof scheduleSlotSchema>;
export type ScheduleOp = z.infer<typeof scheduleOpSchema>;
export type IngestOpsResponse = z.infer<typeof ingestOpsResponseSchema>;
export type LockResponse = z.infer<typeof lockResponseSchema>;
export type ValidationIssue = z.infer<typeof validationIssueSchema>;
export type ValidationResult = z.infer<typeof validationResultSchema>;
export type PublishResponse = z.infer<typeof publishResponseSchema>;
