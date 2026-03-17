import { apiClient } from '@/services/api-client';
import { auditEventsListSchema, type AuditEvent } from '@/types/api';

type AuditQueryParams = {
  event_type?: string;
  actor_id?: string;
  from?: string;
  to?: string;
  page?: number;
  page_size?: number;
};

export async function listAuditEvents(params: AuditQueryParams) {
  const query = new URLSearchParams();

  if (params.event_type) query.set('event_type', params.event_type);
  if (params.actor_id) query.set('actor_id', params.actor_id);
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  if (params.page) query.set('page', String(params.page));
  if (params.page_size) query.set('page_size', String(params.page_size));

  return apiClient.get<{ data: AuditEvent[]; pagination: { total: number; page: number; page_size: number } }>(
    `/audit${query.toString() ? `?${query.toString()}` : ''}`,
    auditEventsListSchema,
  );
}
