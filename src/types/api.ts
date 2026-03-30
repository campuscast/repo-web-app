import { z } from 'zod';

const nullableStringToEmpty = z.preprocess(
  (value) => (value == null ? '' : value),
  z.string(),
);

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

export const mfaLoginChallengeSchema = z.object({
  mfa_required: z.literal(true),
  mfa_token: z.string().min(1),
  expires_in: z.number().int().positive().default(300),
});

export const loginResponseSchema = z.union([tokenPairSchema, mfaLoginChallengeSchema]);

export const userMeSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string().min(1),
    name: z.string().optional(),
    must_change_password: z.boolean().default(false),
  }),
  roles: z.array(z.string()).default([]),
  permissions: z.array(z.string()).default([]),
  zones: z.array(z.string()).default([]),
  mfa_enabled: z.boolean().default(false),
  crdt_enabled: z.boolean().default(false)
});

export const mfaStatusSchema = z.object({
  mfa_enabled: z.boolean().default(false),
  has_secret: z.boolean().default(false),
});

export const mfaSetupSchema = z.object({
  secret: z.string(),
  issuer: z.string(),
  account_name: z.string(),
  otpauth_uri: z.string(),
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
  online: z.boolean().default(false),
  must_change_password: z.boolean().default(false),
  roles: z.array(roleSchema).default([]),
  created_at: z.string().default(''),
  updated_at: z.string().default('')
});

export const adminUserZoneAssignmentSchema = z.object({
  zone_id: z.string(),
  role: z.string().default(''),
});

export const adminUserDetailsSchema = adminUserSchema.extend({
  zones: z.array(adminUserZoneAssignmentSchema).default([]),
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
  description: nullableStringToEmpty.default(''),
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
  group_id: nullableStringToEmpty.default(''),
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
  group_id: nullableStringToEmpty.default('')
});

export const createPendingRequestSchema = z.object({
  device_name: z.string().min(1),
  zone_id: z.string().min(1),
  group_id: nullableStringToEmpty.default(''),
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
  zone_id: z.string().default(''),
  zone_ids: z.array(z.string()).default([]),
  filename: z.string(),
  content_type: z.string(),
  // TypeORM returns bigint columns as strings — coerce to number
  file_size: z.coerce.number().int().nonnegative(),
  sha256_hash: nullableStringToEmpty.default(''),
  status: z.enum(['uploading', 'ready', 'deleted']),
  storage_key: nullableStringToEmpty.default(''),
  signature: nullableStringToEmpty.default(''),
  key_id: nullableStringToEmpty.default(''),
  metadata: z.record(z.string(), z.unknown()).default({}),
  created_at: z.string().nullable().default(null),
  updated_at: z.string().nullable().default(null),
});

export const contentListResponseSchema = z.object({
  data: z.array(contentAssetSchema).default([]),
  pagination: paginationSchema.default({ total: 0, page: 1, page_size: 20 })
});

export const contentAssetUsageByZoneSchema = z.object({
  zone_id: z.string(),
  publication_count: z.number().int().nonnegative().default(0),
});

export const contentAssetInfoSchema = z.object({
  asset: contentAssetSchema,
  usage_by_zone: z.array(contentAssetUsageByZoneSchema).default([]),
  unused_zone_ids: z.array(z.string()).default([]),
});

export const publicationTransitionSchema = z.object({
  type: z.enum(['cut', 'fade']).default('cut'),
  duration_ms: z.number().int().nonnegative().default(0),
}).partial();

export const publicationSlideSchema = z.object({
  background: z.string().default(''),
  title: z.string().default(''),
  body: z.string().default(''),
  image_asset_id: z.string().default(''),
  logo_asset_id: z.string().default(''),
  layout: z.enum(['centered', 'split', 'title-top']).default('centered'),
  image_fit: z.enum(['cover', 'contain', 'stretch', 'center']).default('cover'),
  text_overlay: z.boolean().default(true),
}).partial();

export const publicationVideoSchema = z.object({
  asset_id: z.string(),
  trim_in_ms: z.number().int().nonnegative().default(0),
  trim_out_ms: z.number().int().nonnegative().default(0),
  mute: z.boolean().default(true),
  loop: z.boolean().default(true),
}).partial();

export const publicationItemSchema = z.object({
  item_id: z.string().default(''),
  type: z.enum(['custom_slide', 'video_asset']),
  title: z.string().default(''),
  duration_ms: z.number().int().positive().default(10000),
  transition: publicationTransitionSchema.default({}),
  slide: publicationSlideSchema.optional(),
  video: publicationVideoSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const publicationSchema = z.object({
  publication_id: z.string(),
  zone_id: z.string(),
  title: z.string(),
  type: z.string().default('slideshow'),
  status: z.string().default('draft'),
  version: z.number().int().positive().default(1),
  items: z.array(publicationItemSchema).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
  created_at: z.string().nullable().default(null),
  updated_at: z.string().nullable().default(null),
});

export const publicationsListResponseSchema = z.object({
  data: z.array(publicationSchema).default([]),
  pagination: paginationSchema.default({ total: 0, page: 1, page_size: 20 }),
});

export const slotMetadataSchema = z.object({
  transition_type: z.enum(['cut', 'fade']).default('cut'),
  transition_duration_ms: z.number().int().nonnegative().default(0),
  video_trim_in_ms: z.number().int().nonnegative().default(0),
  video_trim_out_ms: z.number().int().nonnegative().default(0),
  video_mute: z.boolean().default(true),
  video_loop: z.boolean().default(true),
}).partial();

export const scheduleSlotSchema = z.object({
  slot_id: z.string(),
  asset_id: z.preprocess((value) => (value == null ? '' : value), z.string()),
  publication_id: z.preprocess((value) => (value == null ? '' : value), z.string()),
  start_time: z.string(),
  end_time: z.string(),
  priority: z.number().int(),
  zone_id: z.string(),
  group_id: z.string().default(''),
  metadata: slotMetadataSchema.optional(),
});

export const scheduleSchema = z.object({
  schedule_id: z.string(),
  zone_id: z.string(),
  name: z.string(),
  status: z.enum(['draft', 'locked', 'published']),
  current_version: z.number().int().default(1),
  slots: z.array(scheduleSlotSchema).default([]),
  locked_by: z.preprocess((value) => (value == null ? '' : value), z.string()),
  lock_token: z.preprocess((value) => (value == null ? '' : value), z.string()),
  lock_expires_at: z.preprocess((value) => (value == null ? '' : value), z.string()),
  is_locked: z.boolean().default(false),
  has_releases: z.boolean().default(false),
  last_published_at: z.string().default(''),
});

export const schedulesListResponseSchema = z.object({
  data: z.array(scheduleSchema).default([]),
  pagination: paginationSchema.default({ total: 0, page: 1, page_size: 20 })
});

export const scheduleDaySummarySchema = z.object({
  date: z.string(),
  slot_count: z.number().int().nonnegative().default(0),
  asset_slots: z.number().int().nonnegative().default(0),
  publication_slots: z.number().int().nonnegative().default(0),
  total_duration_minutes: z.number().int().nonnegative().default(0),
});

export const scheduleDayViewSchema = z.object({
  schedule_id: z.string(),
  schedule_name: z.string(),
  status: z.string().default('draft'),
  zone_id: z.string(),
  date: z.string(),
  summary: scheduleDaySummarySchema,
  slots: z.array(scheduleSlotSchema).default([]),
});

export const scheduleCalendarMonthSummarySchema = z.object({
  month: z.string(),
  slot_count: z.number().int().nonnegative().default(0),
  total_duration_minutes: z.number().int().nonnegative().default(0),
});

export const scheduleCalendarResponseSchema = z.object({
  schedule_id: z.string(),
  schedule_name: z.string(),
  zone_id: z.string(),
  view: z.enum(['day', 'week', 'month', 'year']),
  range: z.object({
    from: z.string(),
    to: z.string(),
    anchor: z.string(),
  }),
  summaries: z.array(scheduleDaySummarySchema).default([]),
  months: z.array(scheduleCalendarMonthSummarySchema).default([]),
  slots: z.array(scheduleSlotSchema).default([]),
});

export const scheduleUsageSchema = z.object({
  zone_id: z.string(),
  assets: z.record(z.string(), z.number()).default({}),
  publications: z.record(z.string(), z.number()).default({}),
});

export const lockResponseSchema = z.object({
  acquired: z.boolean(),
  lock_token: z.string().default(''),
  locked_by: z.string().default(''),
  expires_at: z.string().default('')
});

export const lockRefreshResponseSchema = z.object({
  refreshed: z.boolean(),
  lock_token: z.string().default(''),
  locked_by: z.string().default(''),
  expires_at: z.string().default(''),
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
  actor: z
    .object({
      auth_type: z.enum(['user_session', 'device_token']).optional(),
      user_id: z.string().optional(),
      device_id: z.string().optional(),
      session_id: z.string().optional()
    })
    .optional(),
  signature: z
    .object({
      signature: z.string().optional(),
      key_id: z.string().optional(),
      algorithm: z.string().optional()
    })
    .optional(),
  slot: scheduleSlotSchema
});

export const signedScheduleOpSchema = scheduleOpSchema.extend({
  signature: z.object({
    signature: z.string(),
    key_id: z.string(),
    algorithm: z.string()
  })
});

export const signOpsResponseSchema = z.object({
  ops: z.array(signedScheduleOpSchema).default([])
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
  valid: z.boolean().optional(),
  has_fatal: z.boolean().optional(),
  issues: z.array(validationIssueSchema).default([])
}).transform((value) => {
  const hasFatalFromIssues = value.issues.some((issue) => issue.severity === 'error');
  const hasFatal = value.has_fatal ?? (typeof value.valid === 'boolean' ? !value.valid : hasFatalFromIssues);
  return {
    valid: !hasFatal,
    has_fatal: hasFatal,
    issues: value.issues,
  };
});

export const publishResponseSchema = z.object({
  release_id: z.string().default(''),
  validation_passed: z.boolean(),
  issues: z.array(validationIssueSchema).default([]),
  rollout_status: z.enum(['pending', 'rolling_out', 'active', 'failed']).default('pending')
});

export const releaseManifestSummarySchema = z.object({
  slot_count: z.number().int().nonnegative().default(0),
  asset_count: z.number().int().nonnegative().default(0),
  publication_count: z.number().int().nonnegative().default(0),
  manifest_hash: z.string().default(''),
  has_signature: z.boolean().default(false),
});

export const scheduleReleaseSchema = z.object({
  release_id: z.string(),
  schedule_id: z.string(),
  schedule_name: z.string().default(''),
  version_number: z.number().int().default(0),
  zone_id: z.string(),
  target_group_ids: z.array(z.string()).default([]),
  manifest_url: z.string().default(''),
  manifest_signature: z.string().default(''),
  manifest_key_id: z.string().default(''),
  manifest_present: z.boolean().default(false),
  status: z.string().default('pending'),
  published_at: z.string(),
  manifest_summary: releaseManifestSummarySchema.default({
    slot_count: 0,
    asset_count: 0,
    publication_count: 0,
    manifest_hash: '',
    has_signature: false,
  }),
});

export const releasesListResponseSchema = z.object({
  data: z.array(scheduleReleaseSchema).default([]),
  pagination: paginationSchema.default({ total: 0, page: 1, page_size: 20 }),
});

export const devicePreviewSchema = z.object({
  device_id: z.string(),
  device_name: z.string().default(''),
  zone_id: z.string().default(''),
  group_id: z.string().default(''),
  preview_available: z.boolean().default(false),
  image_base64: z.string().nullable().optional(),
  image_url: z.string().nullable().optional(),
  mime_type: z.string().default('image/png'),
  status: z.string().nullable().optional(),
  captured_at: z.string().nullable().optional(),
  width: z.number().int().nullable().optional(),
  height: z.number().int().nullable().optional(),
  updated_at: z.string().nullable().optional(),
});

export type TokenPair = z.infer<typeof tokenPairSchema>;
export type MfaLoginChallenge = z.infer<typeof mfaLoginChallengeSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type UserMe = z.infer<typeof userMeSchema>;
export type MfaStatus = z.infer<typeof mfaStatusSchema>;
export type MfaSetup = z.infer<typeof mfaSetupSchema>;
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
export type ContentAssetInfo = z.infer<typeof contentAssetInfoSchema>;
export type PublicationItem = z.infer<typeof publicationItemSchema>;
export type Publication = z.infer<typeof publicationSchema>;
export type Schedule = z.infer<typeof scheduleSchema>;
export type ScheduleSlot = z.infer<typeof scheduleSlotSchema>;
export type ScheduleDaySummary = z.infer<typeof scheduleDaySummarySchema>;
export type ScheduleDayView = z.infer<typeof scheduleDayViewSchema>;
export type ScheduleCalendarResponse = z.infer<typeof scheduleCalendarResponseSchema>;
export type ScheduleUsage = z.infer<typeof scheduleUsageSchema>;
export type SlotMetadata = z.infer<typeof slotMetadataSchema>;
export type ScheduleOp = z.infer<typeof scheduleOpSchema>;
export type SignedScheduleOp = z.infer<typeof signedScheduleOpSchema>;
export type IngestOpsResponse = z.infer<typeof ingestOpsResponseSchema>;
export type LockResponse = z.infer<typeof lockResponseSchema>;
export type LockRefreshResponse = z.infer<typeof lockRefreshResponseSchema>;
export type ValidationIssue = z.infer<typeof validationIssueSchema>;
export type ValidationResult = z.infer<typeof validationResultSchema>;
export type PublishResponse = z.infer<typeof publishResponseSchema>;
export type ReleaseManifestSummary = z.infer<typeof releaseManifestSummarySchema>;
export type ScheduleRelease = z.infer<typeof scheduleReleaseSchema>;
export type DevicePreview = z.infer<typeof devicePreviewSchema>;
export type AdminUser = z.infer<typeof adminUserSchema>;
export type AdminUserDetails = z.infer<typeof adminUserDetailsSchema>;
export type AdminRole = z.infer<typeof roleSchema>;
export type AuditEvent = z.infer<typeof auditEventSchema>;
