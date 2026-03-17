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
    email: z.string().min(1),
    name: z.string().optional()
  }),
  roles: z.array(z.string()).default([]),
  permissions: z.array(z.string()).default([]),
  zones: z.array(z.string()).default([]),
  crdt_enabled: z.boolean().default(false)
});

export const roleSchema = z.object({
  id: z.string(),
  name: z.string(),
  permissions: z.array(z.string()).default([])
});

export const adminUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  status: z.string(),
  must_change_password: z.boolean().default(false),
  roles: z.array(roleSchema).default([]),
  created_at: z.string().default(''),
  updated_at: z.string().default('')
});

export const adminUsersListSchema = z.object({
  data: z.array(adminUserSchema).default([]),
  pagination: paginationSchema.default({ total: 0, page: 1, page_size: 20 })
});

export const rolesListSchema = z.object({
  data: z.array(roleSchema).default([]),
  available_permissions: z.array(z.string()).default([])
});

export const auditEventSchema = z.object({
  event_id: z.string(),
  event_type: z.string(),
  actor_type: z.string().default(''),
  actor_id: z.string().default(''),
  zone_id: z.string().nullable().optional(),
  resource_type: z.string().nullable().optional(),
  resource_id: z.string().nullable().optional(),
  action: z.string().default(''),
  detail: z.record(z.string(), z.unknown()).default({}),
  correlation_id: z.string().nullable().optional(),
  timestamp: z.string(),
});

export const auditEventsListSchema = z.object({
  data: z.array(auditEventSchema).default([]),
  pagination: paginationSchema.default({ total: 0, page: 1, page_size: 20 }),
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
  status: z.enum(['pending', 'active', 'revoked', 'offline']),
  hardware_id: z.string().nullable().optional(),
  mqtt_client_id: z.string().nullable().optional(),
  enrolled_at: z.string().nullable().optional(),
  last_seen: z.string().nullable().optional()
});

export const registerDeviceRequestSchema = z.object({
  device_name: z.string().min(1),
  device_type: z.enum(['android_tv', 'desktop', 'web']),
  hardware_id: z.string().optional(),
  zone_id: z.string().min(1),
  group_id: z.string().min(1)
});

export const createPendingRequestSchema = z.object({
  device_name: z.string().min(1),
  zone_id: z.string().min(1),
  group_id: z.string().min(1),
  hardware_id: z.string().optional()
});

export const updateDeviceRequestSchema = z.object({
  device_name: z.string().min(1).optional(),
  device_type: z.string().optional()
});

export const registerDeviceResponseSchema = z.object({
  device_id: z.string(),
  device_token: z.string(),
  mqtt_client_id: z.string(),
  mqtt_topic_prefix: z.string()
});

export const createPendingDeviceResponseSchema = z.object({
  device_id: z.string(),
  player_id: z.string().optional()
});

export const activationResponseSchema = z.object({
  device_id: z.string(),
  device_token: z.string().nullable(),
  mqtt_client_id: z.string(),
  mqtt_topic_prefix: z.string(),
  token_expires_at: z.string().optional(),
  already_active: z.boolean().optional()
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
  // TypeORM returns bigint columns as strings — coerce to number
  file_size: z.coerce.number().int().nonnegative(),
  sha256_hash: z.string(),
  status: z.enum(['uploading', 'ready', 'deleted']),
  storage_key: z.string().default(''),
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
export type CreatePendingRequest = z.infer<typeof createPendingRequestSchema>;
export type UpdateDeviceRequest = z.infer<typeof updateDeviceRequestSchema>;
export type RegisterDeviceResponse = z.infer<typeof registerDeviceResponseSchema>;
export type CreatePendingDeviceResponse = z.infer<typeof createPendingDeviceResponseSchema>;
export type ActivationResponse = z.infer<typeof activationResponseSchema>;
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
export type AdminUser = z.infer<typeof adminUserSchema>;
export type AdminRole = z.infer<typeof roleSchema>;
export type AuditEvent = z.infer<typeof auditEventSchema>;
