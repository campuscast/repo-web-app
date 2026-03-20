'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addDays,
  addMinutes,
  differenceInMinutes,
  endOfDay,
  format,
  formatDistanceToNowStrict,
  isAfter,
  isBefore,
  parseISO,
  startOfDay,
  startOfWeek
} from 'date-fns';
import { enUS, ru } from 'date-fns/locale';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarRange, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { toast } from 'sonner';
import { useAuthStore } from '@/auth/store';
import { hasRole } from '@/auth/guards';
import { getAccessToken } from '@/auth/token-store';
import { useCrdtStore } from '@/features/schedules/crdt-store';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { useCrdtQueue } from '@/hooks/use-crdt-queue';
import { useLocale } from '@/hooks/use-locale';
import { env } from '@/lib/env';
import { queryKeys } from '@/lib/query-keys';
import { EmptyState } from '@/components/common/empty-state';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { scheduleService } from '@/services/schedule-service';
import { zoneService } from '@/services/zone-service';
import { WsSyncClient, type SyncStatus } from '@/services/ws-client';
import type { ScheduleOp, ScheduleSlot, SlotMetadata, ValidationIssue } from '@/types/api';

type ScheduleEditorProps = {
  scheduleId: string;
};

type ViewMode = 'day' | 'week';

type PriorityOutcome = {
  slotId: string;
  outcome: 'winner' | 'shadowed' | 'tie';
  reason: string;
};

type SlotSegment = {
  slot: ScheduleSlot;
  left: number;
  width: number;
  clipped: boolean;
};

type LocalSlotForm = {
  asset_id: string;
  publication_id: string;
  start_time: string;
  end_time: string;
  priority: string;
  group_id: string;
  zone_id: string;
  transition_type: 'cut' | 'fade';
  transition_duration_ms: string;
  video_trim_in_ms: string;
  video_trim_out_ms: string;
  video_mute: boolean;
  video_loop: boolean;
};

const EMPTY_SLOT_FORM: LocalSlotForm = {
  asset_id: '',
  publication_id: '',
  start_time: '',
  end_time: '',
  priority: '0',
  group_id: '',
  zone_id: '',
  transition_type: 'cut',
  transition_duration_ms: '0',
  video_trim_in_ms: '0',
  video_trim_out_ms: '0',
  video_mute: true,
  video_loop: true,
};

const MINUTES_IN_DAY = 24 * 60;
const PIXELS_PER_MINUTE = 0.9;
const TIMELINE_WIDTH = MINUTES_IN_DAY * PIXELS_PER_MINUTE;

const createScheduleSchema = z.object({
  name: z.string().min(2)
});

function inferSignatureFailure(issues: ValidationIssue[] = []) {
  return issues.some(
    (issue) => issue.code.toLowerCase().includes('sign') || issue.message.toLowerCase().includes('signature')
  );
}

function clampIntervalToDay(slot: ScheduleSlot, day: Date): { startMin: number; endMin: number; clipped: boolean } | null {
  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);
  const start = parseISO(slot.start_time);
  const end = parseISO(slot.end_time);
  if (!isBefore(start, dayEnd) || !isAfter(end, dayStart)) {
    return null;
  }

  const clampedStart = isBefore(start, dayStart) ? dayStart : start;
  const clampedEnd = isAfter(end, dayEnd) ? dayEnd : end;
  const startMin = Math.max(0, differenceInMinutes(clampedStart, dayStart));
  const endMin = Math.max(startMin + 1, differenceInMinutes(clampedEnd, dayStart));

  return {
    startMin,
    endMin,
    clipped: isBefore(start, dayStart) || isAfter(end, dayEnd)
  };
}

function datetimeLocal(iso: string): string {
  const date = parseISO(iso);
  if (Number.isNaN(date.getTime())) return '';
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

export function ScheduleEditor({ scheduleId }: ScheduleEditorProps) {
  const { t, locale } = useLocale();
  const queryClient = useQueryClient();
  const router = useRouter();
  const dateLocale = locale === 'ru' ? ru : enUS;

  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [slotForm, setSlotForm] = useState<LocalSlotForm>(EMPTY_SLOT_FORM);
  const [slotDraft, setSlotDraft] = useState<LocalSlotForm>(EMPTY_SLOT_FORM);
  const [localSlots, setLocalSlots] = useState<ScheduleSlot[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [timelineDate, setTimelineDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [newScheduleName, setNewScheduleName] = useState('');
  const [lockToken, setLockToken] = useState('');
  const [lockOwner, setLockOwner] = useState('');
  const [lockExpiresAt, setLockExpiresAt] = useState<string>('');
  const [qaIssues, setQaIssues] = useState<ValidationIssue[]>([]);
  const [releaseInfo, setReleaseInfo] = useState<{ releaseId: string; rolloutStatus: string } | null>(null);
  const [lastValidationAt, setLastValidationAt] = useState('');
  const [lastPublishAt, setLastPublishAt] = useState('');
  const [resyncStatus, setResyncStatus] = useState<'idle' | 'requesting' | 'received'>('idle');
  const [lastResyncAt, setLastResyncAt] = useState('');

  const roles = useAuthStore((state) => state.roles);
  const allowedZones = useAuthStore((state) => state.zones);
  const crdtEnabled = useAuthStore((state) => state.crdtEnabled);
  const currentUserId = useAuthStore((state) => state.user?.id);

  const isAdmin = hasRole(roles, 'admin') || hasRole(roles, 'super_admin');
  const lamportRef = useRef(0);
  const editorSessionIdRef = useRef(`editor-session-${crypto.randomUUID()}`);
  const isSendingRef = useRef(false);
  const seenOperationIdsRef = useRef<Set<string>>(new Set());
  const bufferedRemoteOpsRef = useRef<Array<{ op_type: string; slot: ScheduleSlot; causal?: { operation_id?: string } }>>([]);

  const { isOnline } = useNetworkStatus();
  const { rejected, transforms, pushOp, setRejected, setTransform, revertLast, clearAll } = useCrdtStore();
  const { pending, enqueue, dequeueMany, clearSchedule } = useCrdtQueue(scheduleId);

  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const wsRef = useRef<WsSyncClient | null>(null);
  const isSyncingRef = useRef(false);
  const prevSyncStatusRef = useRef<SyncStatus>('idle');
  const lastKnownOpIdRef = useRef<string | undefined>(undefined);

  const zonesQuery = useQuery({
    queryKey: queryKeys.zones,
    queryFn: zoneService.listZones
  });

  const visibleZones = useMemo(() => {
    const zones = zonesQuery.data ?? [];
    if (isAdmin) return zones;
    return zones.filter((zone) => allowedZones.includes(zone.zone_id));
  }, [allowedZones, isAdmin, zonesQuery.data]);

  const effectiveZoneId = selectedZoneId || visibleZones[0]?.zone_id || '';

  const schedulesQuery = useQuery({
    queryKey: effectiveZoneId ? queryKeys.schedules(effectiveZoneId) : ['schedules', 'none'],
    queryFn: () => scheduleService.listSchedules(effectiveZoneId),
    enabled: Boolean(effectiveZoneId)
  });

  const activeSchedule = useMemo(() => {
    const list = schedulesQuery.data ?? [];
    if (scheduleId === 'default') return list[0] ?? null;
    return list.find((item) => item.schedule_id === scheduleId) ?? list[0] ?? null;
  }, [scheduleId, schedulesQuery.data]);

  useEffect(() => {
    if (activeSchedule?.slots?.length) {
      setLocalSlots(activeSchedule.slots);
      setSlotForm((prev) => ({ ...prev, zone_id: prev.zone_id || activeSchedule.zone_id }));
      return;
    }

    setLocalSlots([]);
    setSelectedSlotId('');
  }, [activeSchedule]);

  const selectedSlot = useMemo(
    () => localSlots.find((slot) => slot.slot_id === selectedSlotId) ?? null,
    [localSlots, selectedSlotId]
  );

  const rememberOperationId = useCallback((operationId?: string | null) => {
    if (!operationId) return;
    const seen = seenOperationIdsRef.current;
    seen.add(operationId);

    // Bounded set to avoid unbounded memory growth during long editing sessions.
    if (seen.size > 5000) {
      const ids = Array.from(seen);
      seenOperationIdsRef.current = new Set(ids.slice(ids.length - 3000));
    }

    lastKnownOpIdRef.current = operationId;
  }, []);

  const applyOpsToLocalState = useCallback(
    (ops: Array<{ op_type: string; slot: ScheduleSlot; causal?: { operation_id?: string } }>) => {
      if (!ops.length) return;

      setLocalSlots((prev) => {
        let next = [...prev];
        for (const op of ops) {
          if (!op.op_type || !op.slot) continue;

          const operationId = op.causal?.operation_id;
          if (operationId && seenOperationIdsRef.current.has(operationId)) {
            continue;
          }
          rememberOperationId(operationId);

          switch (op.op_type) {
            case 'add_slot':
              if (!next.some((slot) => slot.slot_id === op.slot.slot_id)) {
                next = [...next, op.slot];
              }
              break;
            case 'remove_slot':
              next = next.filter((slot) => slot.slot_id !== op.slot.slot_id);
              break;
            case 'update_slot': {
              const idx = next.findIndex((slot) => slot.slot_id === op.slot.slot_id);
              if (idx >= 0) {
                next = [...next];
                next[idx] = { ...next[idx], ...op.slot };
              }
              break;
            }
            case 'move_slot': {
              const idx = next.findIndex((slot) => slot.slot_id === op.slot.slot_id);
              if (idx >= 0) {
                next = [...next];
                next[idx] = { ...next[idx], start_time: op.slot.start_time, end_time: op.slot.end_time };
              }
              break;
            }
          }
        }
        return next;
      });
    },
    [rememberOperationId]
  );

  const signPendingOps = useCallback(async () => {
    if (!activeSchedule || !pending.length) return [];
    return scheduleService.signOps(
      activeSchedule.schedule_id,
      pending.map((item) => item.op)
    );
  }, [activeSchedule, pending]);

  useEffect(() => {
    if (!selectedSlot) {
      setSlotDraft((prev) => ({ ...prev, zone_id: prev.zone_id || activeSchedule?.zone_id || '' }));
      return;
    }
    setSlotDraft({
      asset_id: selectedSlot.asset_id,
      publication_id: selectedSlot.publication_id || '',
      start_time: datetimeLocal(selectedSlot.start_time),
      end_time: datetimeLocal(selectedSlot.end_time),
      priority: String(selectedSlot.priority),
      group_id: selectedSlot.group_id,
      zone_id: selectedSlot.zone_id,
      transition_type: selectedSlot.metadata?.transition_type ?? 'cut',
      transition_duration_ms: String(selectedSlot.metadata?.transition_duration_ms ?? 0),
      video_trim_in_ms: String(selectedSlot.metadata?.video_trim_in_ms ?? 0),
      video_trim_out_ms: String(selectedSlot.metadata?.video_trim_out_ms ?? 0),
      video_mute: selectedSlot.metadata?.video_mute ?? true,
      video_loop: selectedSlot.metadata?.video_loop ?? true,
    });
  }, [activeSchedule?.zone_id, selectedSlot]);

  const timelineStartDate = useMemo(() => {
    const parsed = parseISO(`${timelineDate}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      return startOfDay(new Date());
    }
    return startOfDay(parsed);
  }, [timelineDate]);

  const timelineDays = useMemo(() => {
    if (viewMode === 'day') {
      return [timelineStartDate];
    }
    const weekStart = startOfWeek(timelineStartDate, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  }, [timelineStartDate, viewMode]);

  const timelineZones = useMemo(() => {
    const known = new Map<string, string>();
    for (const zone of visibleZones) {
      known.set(zone.zone_id, zone.name);
    }
    if (activeSchedule?.zone_id && !known.has(activeSchedule.zone_id)) {
      known.set(activeSchedule.zone_id, activeSchedule.zone_id);
    }
    for (const slot of localSlots) {
      if (!known.has(slot.zone_id)) {
        known.set(slot.zone_id, slot.zone_id);
      }
    }
    return Array.from(known.entries()).map(([zone_id, name]) => ({ zone_id, name }));
  }, [activeSchedule?.zone_id, localSlots, visibleZones]);

  const priorityOutcomeBySlot = useMemo(() => {
    const outcomes = new Map<string, PriorityOutcome>();
    const laneSlots = new Map<string, ScheduleSlot[]>();

    for (const day of timelineDays) {
      const dayKey = format(day, 'yyyy-MM-dd');
      for (const slot of localSlots) {
        const segment = clampIntervalToDay(slot, day);
        if (!segment) continue;
        const laneKey = `${dayKey}|${slot.zone_id}`;
        const current = laneSlots.get(laneKey) ?? [];
        current.push(slot);
        laneSlots.set(laneKey, current);
      }
    }

    for (const slots of laneSlots.values()) {
      const sorted = [...slots].sort(
        (a, b) => parseISO(a.start_time).getTime() - parseISO(b.start_time).getTime()
      );
      for (let i = 0; i < sorted.length; i += 1) {
        for (let j = i + 1; j < sorted.length; j += 1) {
          const a = sorted[i];
          const b = sorted[j];
          const aStart = parseISO(a.start_time);
          const aEnd = parseISO(a.end_time);
          const bStart = parseISO(b.start_time);
          const bEnd = parseISO(b.end_time);

          const overlaps = isBefore(aStart, bEnd) && isBefore(bStart, aEnd);
          if (!overlaps) continue;

          if (a.priority === b.priority) {
            if (!outcomes.has(a.slot_id)) {
              outcomes.set(a.slot_id, {
                slotId: a.slot_id,
                outcome: 'tie',
                reason: `Priority tie with ${b.slot_id.slice(0, 8)}`
              });
            }
            if (!outcomes.has(b.slot_id)) {
              outcomes.set(b.slot_id, {
                slotId: b.slot_id,
                outcome: 'tie',
                reason: `Priority tie with ${a.slot_id.slice(0, 8)}`
              });
            }
            continue;
          }

          const winner = a.priority > b.priority ? a : b;
          const loser = winner.slot_id === a.slot_id ? b : a;

          outcomes.set(winner.slot_id, {
            slotId: winner.slot_id,
            outcome: 'winner',
            reason: `Wins overlap by priority p${winner.priority}`
          });

          outcomes.set(loser.slot_id, {
            slotId: loser.slot_id,
            outcome: 'shadowed',
            reason: `Shadowed by ${winner.slot_id.slice(0, 8)} (p${winner.priority})`
          });
        }
      }
    }

    return outcomes;
  }, [localSlots, timelineDays]);

  const timelineSegments = useMemo(() => {
    const byLane = new Map<string, SlotSegment[]>();
    for (const day of timelineDays) {
      const dayKey = format(day, 'yyyy-MM-dd');
      for (const zone of timelineZones) {
        const laneKey = `${dayKey}|${zone.zone_id}`;
        const segments: SlotSegment[] = [];
        for (const slot of localSlots) {
          if (slot.zone_id !== zone.zone_id) continue;
          const clamped = clampIntervalToDay(slot, day);
          if (!clamped) continue;
          segments.push({
            slot,
            left: clamped.startMin * PIXELS_PER_MINUTE,
            width: Math.max(8, (clamped.endMin - clamped.startMin) * PIXELS_PER_MINUTE),
            clipped: clamped.clipped
          });
        }
        segments.sort((a, b) => a.left - b.left);
        byLane.set(laneKey, segments);
      }
    }
    return byLane;
  }, [localSlots, timelineDays, timelineZones]);

  const createScheduleMutation = useMutation({
    mutationFn: async () => {
      const parsed = createScheduleSchema.safeParse({ name: newScheduleName.trim() });
      if (!parsed.success) {
        throw new Error(t('schedules.toast.invalidName'));
      }

      if (!effectiveZoneId) {
        throw new Error(t('schedules.toast.selectZone'));
      }

      return scheduleService.createSchedule({ zone_id: effectiveZoneId, name: parsed.data.name });
    },
    onSuccess: async (schedule) => {
      setNewScheduleName('');
      await queryClient.invalidateQueries({ queryKey: queryKeys.schedules(effectiveZoneId) });
      toast.success(t('schedules.toast.created'));
      router.push(`/schedules/${schedule.schedule_id}`);
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : t('schedules.toast.createFailed'),
      ),
  });

  const lockMutation = useMutation({
    mutationFn: () => {
      if (!activeSchedule) throw new Error(t('schedule.editor.schedule'));
      return scheduleService.lock(activeSchedule.schedule_id);
    },
    onSuccess: (result) => {
      if (!result.acquired || !result.lock_token) {
        toast.error(t('schedule.editor.lockNotAcquired'));
        return;
      }

      setLockToken(result.lock_token);
      setLockOwner(result.locked_by || 'unknown');
      setLockExpiresAt(result.expires_at || '');
      toast.success(t('schedule.editor.lockAcquired'));
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('schedule.editor.lock')),
  });

  const unlockMutation = useMutation({
    mutationFn: () => {
      if (!activeSchedule || !lockToken) throw new Error(t('schedule.editor.lock'));
      return scheduleService.unlock(activeSchedule.schedule_id, lockToken);
    },
    onSuccess: () => {
      setLockToken('');
      setLockOwner('');
      setLockExpiresAt('');
      toast.success(t('schedule.editor.unlock'));
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('schedule.editor.unlock')),
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!activeSchedule || !lockToken) throw new Error(t('schedule.editor.lock'));
      return scheduleService.saveDraft(activeSchedule.schedule_id, localSlots, lockToken);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.schedules(effectiveZoneId) });
      toast.success(t('schedule.editor.saveDraft'));
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('schedule.editor.saveDraft')),
  });

  const validateMutation = useMutation({
    mutationFn: () => {
      if (!activeSchedule) throw new Error(t('schedule.editor.schedule'));
      return scheduleService.validate(activeSchedule.schedule_id);
    },
    onSuccess: (result) => {
      setQaIssues(result.issues);
      setLastValidationAt(new Date().toISOString());
      if (!result.issues.length) {
        toast.success(t('schedule.editor.qaNoIssues'));
      }
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : t('schedule.editor.qaValidate'),
      ),
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!activeSchedule) throw new Error(t('schedule.editor.schedule'));

      const validation = await scheduleService.validate(activeSchedule.schedule_id);
      setQaIssues(validation.issues);

      if (!validation.valid || validation.has_fatal || inferSignatureFailure(validation.issues)) {
        throw new Error(t('schedule.editor.qaIssues'));
      }

      const result = await scheduleService.publish(activeSchedule.schedule_id, activeSchedule.current_version, []);
      if (!result.validation_passed || inferSignatureFailure(result.issues)) {
        throw new Error(t('schedule.editor.qaIssues'));
      }

      return result;
    },
    onSuccess: (result) => {
      setReleaseInfo({
        releaseId: result.release_id || 'n/a',
        rolloutStatus: result.rollout_status || 'pending'
      });
      setQaIssues(result.issues ?? []);
      setLastPublishAt(new Date().toISOString());
      toast.success(t('schedule.editor.lastRelease'));
    },
    onError: (error) => {
      setReleaseInfo(null);
      toast.error(error instanceof Error ? error.message : t('schedule.editor.publish'));
    }
  });

  const opsBatchMutation = useMutation({
    mutationFn: async () => {
      if (!activeSchedule) throw new Error(t('schedule.editor.schedule'));
      if (!pending.length) return null;
      const signedOps = await signPendingOps();
      if (!signedOps.length) return null;
      return scheduleService.ingestOps(activeSchedule.schedule_id, signedOps);
    },
    onSuccess: async (result) => {
      if (!result) return;
      const rows = result.results ?? [];
      const ackedIds = rows.filter((row) => row.accepted).map((row) => row.operation_id);
      const duplicateIds = rows
        .filter((row) => !row.accepted && (row.reason === 'duplicate_operation' || row.reason === 'already_applied'))
        .map((row) => row.operation_id);
      const rejectedRows = rows.filter(
        (row) => !row.accepted && row.reason !== 'duplicate_operation' && row.reason !== 'already_applied'
      );

      const settledIds = [...ackedIds, ...duplicateIds];
      settledIds.forEach((id) => rememberOperationId(id));
      await dequeueMany(settledIds);

      for (const row of rejectedRows) {
        setRejected({
          operation_id: row.operation_id,
          reason: row.reason ?? 'unknown',
          explanation: row.explanation
        });
      }

      if (result.rejected > 0) {
        toast.error(`${t('schedule.editor.rejected')}: ${result.rejected}`);
      }
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('schedule.editor.syncBatch')),
  });

  const emitCrdtOp = useCallback(
    async (opType: ScheduleOp['op_type'], slot: ScheduleSlot) => {
      if (!crdtEnabled) return;
      const userId = currentUserId || 'unknown';
      const sessionId = editorSessionIdRef.current;
      const op: ScheduleOp = {
        op_type: opType,
        causal: {
          operation_id: crypto.randomUUID(),
          client_id: `editor:${userId}`,
          lamport_ts: ++lamportRef.current,
          session_id: sessionId
        },
        actor: {
          auth_type: 'user_session',
          user_id: userId,
          session_id: sessionId
        },
        slot
      };
      pushOp(op);
      await enqueue(op);
    },
    [crdtEnabled, currentUserId, enqueue, pushOp]
  );

  const addLocalSlot = useCallback(
    async (slot: ScheduleSlot) => {
      setLocalSlots((prev) => [...prev, slot]);
      await emitCrdtOp('add_slot', slot);
    },
    [emitCrdtOp]
  );

  const updateLocalSlot = useCallback(
    async (slot: ScheduleSlot, opType: ScheduleOp['op_type'] = 'update_slot') => {
      setLocalSlots((prev) =>
        prev.map((item) => (item.slot_id === slot.slot_id ? slot : item))
      );
      await emitCrdtOp(opType, slot);
    },
    [emitCrdtOp]
  );

  const removeLocalSlot = useCallback(
    async (slot: ScheduleSlot) => {
      setLocalSlots((prev) => prev.filter((item) => item.slot_id !== slot.slot_id));
      if (selectedSlotId === slot.slot_id) {
        setSelectedSlotId('');
      }
      await emitCrdtOp('remove_slot', slot);
    },
    [emitCrdtOp, selectedSlotId]
  );

  useEffect(() => {
    if (!crdtEnabled || !isOnline) {
      wsRef.current?.disconnect();
      wsRef.current = null;
      return;
    }

    const token = getAccessToken();
    if (!token) {
      setSyncStatus('offline');
      return;
    }

    const client = new WsSyncClient({
      url: env.wsSyncUrl,
      accessToken: token,
      handlers: {
        onStatus: setSyncStatus,
        onSyncAck: async (payload) => {
          payload.operation_ids.forEach((id) => rememberOperationId(id));
          await dequeueMany(payload.operation_ids);
        },
        onSyncReject: (payload) => {
          if (payload.reason === 'duplicate_operation' || payload.reason === 'already_applied') {
            rememberOperationId(payload.operation_id);
            void dequeueMany([payload.operation_id]);
            return;
          }
          setRejected({
            operation_id: payload.operation_id,
            reason: payload.reason,
            explanation: payload.explanation
          });
        },
        onTransform: (payload) => {
          setTransform({ operation_id: payload.operation_id, reason: payload.reason });
        },
        onSnapshot: async (payload) => {
          if (!payload.slots) return;

          isSyncingRef.current = true;
          try {
            // 1. Apply server snapshot as authoritative state
            setLocalSlots(payload.slots as ScheduleSlot[]);

            // 2. Track last known operation for future delta sync.
            if (payload.last_operation_id) {
              rememberOperationId(payload.last_operation_id);
            }

            // 3. Reconcile pending queue with missing_ops returned by server delta sync.
            const missingOpIds = (payload.missing_ops || [])
              .map((op) => op?.operation_id)
              .filter((id): id is string => Boolean(id));
            if (missingOpIds.length > 0) {
              missingOpIds.forEach((id) => rememberOperationId(id));
              await dequeueMany(missingOpIds);
            }

            // 4. Apply remote ops buffered while snapshot was in-flight.
            if (bufferedRemoteOpsRef.current.length > 0) {
              applyOpsToLocalState(bufferedRemoteOpsRef.current);
              bufferedRemoteOpsRef.current = [];
            }
          } finally {
            isSyncingRef.current = false;
            setResyncStatus('received');
            setLastResyncAt(new Date().toISOString());
          }
        },
        onRemoteOps: async (payload) => {
          // Broadcast from another editor — apply ops incrementally
          if (!Array.isArray(payload.ops)) return;
          const ops = payload.ops as Array<{ op_type: string; slot: ScheduleSlot; causal?: { operation_id?: string } }>;

          if (isSyncingRef.current) {
            bufferedRemoteOpsRef.current.push(...ops);
            return;
          }

          applyOpsToLocalState(ops);

          const remotelyAcknowledged = ops
            .map((op) => op.causal?.operation_id)
            .filter((id): id is string => Boolean(id));
          if (remotelyAcknowledged.length > 0) {
            await dequeueMany(remotelyAcknowledged);
          }
        },
      }
    });

    client.connect();
    wsRef.current = client;

    return () => {
      client.disconnect();
      wsRef.current = null;
    };
  }, [applyOpsToLocalState, crdtEnabled, dequeueMany, isOnline, rememberOperationId, setRejected, setTransform]);

  // Request sync on reconnect (offline/idle -> online transition)
  useEffect(() => {
    const wasOffline = prevSyncStatusRef.current === 'offline' || prevSyncStatusRef.current === 'idle';
    prevSyncStatusRef.current = syncStatus;

    if (wasOffline && syncStatus === 'online' && activeSchedule && wsRef.current && !isSyncingRef.current) {
      isSyncingRef.current = true;
      setResyncStatus('requesting');
      wsRef.current.requestSync(activeSchedule.schedule_id, lastKnownOpIdRef.current);
      // isSyncingRef is cleared by onSnapshot handler when snapshot arrives
    }
  }, [syncStatus, activeSchedule]);

  // Auto-send pending ops (guarded by isSyncing to prevent loops)
  useEffect(() => {
    if (!crdtEnabled || !isOnline || !pending.length || !activeSchedule) return;
    if (isSyncingRef.current || isSendingRef.current) return;

    isSendingRef.current = true;

    void (async () => {
      let sentViaHttp = false;
      try {
        const signedOps = await signPendingOps();
        if (!signedOps.length) return;

        if (wsRef.current && syncStatus === 'online') {
          wsRef.current.sendOps(activeSchedule.schedule_id, signedOps);
          return;
        }

        sentViaHttp = true;
        await opsBatchMutation.mutateAsync();
      } catch {
        if (!sentViaHttp) {
          try {
            await opsBatchMutation.mutateAsync();
          } catch {
            // errors are surfaced by mutation onError
          }
        }
      } finally {
        isSendingRef.current = false;
      }
    })();
  }, [activeSchedule, crdtEnabled, isOnline, opsBatchMutation.mutateAsync, pending, signPendingOps, syncStatus]);

  const lockTtl = lockExpiresAt
    ? formatDistanceToNowStrict(new Date(lockExpiresAt), {
        addSuffix: true,
        locale: dateLocale,
      })
    : '—';

  const hourMarks = useMemo(() => Array.from({ length: 25 }, (_, index) => index), []);

  const requestResync = useCallback(() => {
    if (!activeSchedule || !wsRef.current || syncStatus !== 'online') {
      toast.error(t('schedule.editor.sync'));
      return;
    }
    try {
      isSyncingRef.current = true;
      setResyncStatus('requesting');
      wsRef.current.requestSync(activeSchedule.schedule_id, lastKnownOpIdRef.current);
    } catch (error) {
      isSyncingRef.current = false;
      toast.error(error instanceof Error ? error.message : t('schedule.editor.resyncButton'));
    }
  }, [activeSchedule, syncStatus, t]);

  const addSlot = async () => {
    if (!activeSchedule || (!slotForm.asset_id && !slotForm.publication_id) || !slotForm.start_time || !slotForm.end_time) {
      toast.error(t('schedule.editor.addSlot'));
      return;
    }

    const start = new Date(slotForm.start_time);
    const end = new Date(slotForm.end_time);
    if (!isBefore(start, end)) {
      toast.error(t('schedule.editor.timeRange'));
      return;
    }

    const zoneId = slotForm.zone_id || activeSchedule.zone_id;
    const slot: ScheduleSlot = {
      slot_id: crypto.randomUUID(),
      asset_id: slotForm.asset_id,
      publication_id: slotForm.publication_id,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      priority: Number(slotForm.priority),
      zone_id: zoneId,
      group_id: slotForm.group_id,
      metadata: {
        transition_type: slotForm.transition_type,
        transition_duration_ms: Number(slotForm.transition_duration_ms) || 0,
        video_trim_in_ms: Number(slotForm.video_trim_in_ms) || 0,
        video_trim_out_ms: Number(slotForm.video_trim_out_ms) || 0,
        video_mute: slotForm.video_mute,
        video_loop: slotForm.video_loop,
      },
    };

    await addLocalSlot(slot);
    setSelectedSlotId(slot.slot_id);
    setSlotForm({ ...EMPTY_SLOT_FORM, zone_id: zoneId });
  };

  const saveSelectedSlot = async (patch: Partial<ScheduleSlot>, opType: ScheduleOp['op_type'] = 'update_slot') => {
    if (!selectedSlot) return;
    const next: ScheduleSlot = {
      ...selectedSlot,
      ...patch
    };
    const nextStart = parseISO(next.start_time);
    const nextEnd = parseISO(next.end_time);
    if (!isBefore(nextStart, nextEnd)) {
      toast.error(t('schedule.editor.timeRange'));
      return;
    }
    await updateLocalSlot(next, opType);
  };

  const shiftSelectedSlot = async (minutes: number) => {
    if (!selectedSlot) return;
    const start = addMinutes(parseISO(selectedSlot.start_time), minutes).toISOString();
    const end = addMinutes(parseISO(selectedSlot.end_time), minutes).toISOString();
    await saveSelectedSlot({ start_time: start, end_time: end }, 'move_slot');
  };

  const resizeSelectedSlot = async (minutes: number) => {
    if (!selectedSlot) return;
    const start = parseISO(selectedSlot.start_time);
    const nextEnd = addMinutes(parseISO(selectedSlot.end_time), minutes);
    if (!isBefore(start, nextEnd)) {
      toast.error(t('schedule.editor.priority'));
      return;
    }
    await saveSelectedSlot({ end_time: nextEnd.toISOString() }, 'update_slot');
  };

  const saveSelectedSlotDraft = async () => {
    if (!selectedSlot) return;
    if ((!slotDraft.asset_id && !slotDraft.publication_id) || !slotDraft.start_time || !slotDraft.end_time) {
      toast.error(t('schedule.editor.addSlot'));
      return;
    }
    const nextStart = new Date(slotDraft.start_time);
    const nextEnd = new Date(slotDraft.end_time);
    if (!isBefore(nextStart, nextEnd)) {
      toast.error(t('schedule.editor.timeRange'));
      return;
    }

    await saveSelectedSlot({
      asset_id: slotDraft.asset_id,
      publication_id: slotDraft.publication_id,
      start_time: nextStart.toISOString(),
      end_time: nextEnd.toISOString(),
      priority: Number(slotDraft.priority),
      group_id: slotDraft.group_id,
      zone_id: slotDraft.zone_id || activeSchedule?.zone_id || selectedSlot.zone_id,
      metadata: {
        transition_type: slotDraft.transition_type,
        transition_duration_ms: Number(slotDraft.transition_duration_ms) || 0,
        video_trim_in_ms: Number(slotDraft.video_trim_in_ms) || 0,
        video_trim_out_ms: Number(slotDraft.video_trim_out_ms) || 0,
        video_mute: slotDraft.video_mute,
        video_loop: slotDraft.video_loop,
      },
    });
  };

  const priorityAlerts = useMemo(
    () => Array.from(priorityOutcomeBySlot.values()).filter((item) => item.outcome !== 'winner'),
    [priorityOutcomeBySlot]
  );

  return (
    <div className="space-y-4">
      <PageHeader
        description={
          activeSchedule
            ? t('schedule.editor.description', { name: activeSchedule.name })
            : t('schedule.editor.descriptionFallback')
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {crdtEnabled ? (
              <>
                <Button variant="outline" disabled={!pending.length} onClick={() => opsBatchMutation.mutate()}>
                  {t('schedule.editor.syncBatch')}
                </Button>
                <Button variant="outline" onClick={() => validateMutation.mutate()}>
                  {t('schedule.editor.qaValidate')}
                </Button>
                <Button onClick={() => publishMutation.mutate()}>
                  {t('schedule.editor.publish')}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => lockMutation.mutate()} disabled={lockMutation.isPending}>
                  {t('schedule.editor.lock')}
                </Button>
                <Button variant="outline" onClick={() => saveMutation.mutate()} disabled={!lockToken || saveMutation.isPending}>
                  {t('schedule.editor.saveDraft')}
                </Button>
                <Button onClick={() => publishMutation.mutate()} disabled={!lockToken || publishMutation.isPending}>
                  {t('schedule.editor.publish')}
                </Button>
                <Button variant="ghost" onClick={() => unlockMutation.mutate()} disabled={!lockToken || unlockMutation.isPending}>
                  {t('schedule.editor.unlock')}
                </Button>
              </>
            )}
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>{t('schedule.editor.context')}</CardTitle>
          <CardDescription>{t('schedule.editor.contextDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <Label>{t('schedule.editor.zone')}</Label>
            <Select value={effectiveZoneId} onValueChange={setSelectedZoneId}>
              <SelectTrigger>
                <SelectValue placeholder={t('schedules.selectZone')} />
              </SelectTrigger>
              <SelectContent>
                {visibleZones.map((zone) => (
                  <SelectItem key={zone.zone_id} value={zone.zone_id}>
                    {zone.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t('schedule.editor.schedule')}</Label>
            <Select
              value={activeSchedule?.schedule_id ?? ''}
              onValueChange={(value) => {
                const next = (schedulesQuery.data ?? []).find((item) => item.schedule_id === value);
                if (next?.slots) {
                  setLocalSlots(next.slots);
                }
                setSelectedSlotId('');
                if (next?.zone_id) {
                  setSlotForm((prev) => ({ ...prev, zone_id: next.zone_id }));
                }
                router.push(`/schedules/${value}`);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('schedule.editor.schedule')} />
              </SelectTrigger>
              <SelectContent>
                {(schedulesQuery.data ?? []).map((schedule) => (
                  <SelectItem key={schedule.schedule_id} value={schedule.schedule_id}>
                    {schedule.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t('schedule.editor.newSchedule')}</Label>
            <div className="flex gap-2">
              <Input
                value={newScheduleName}
                onChange={(event) => setNewScheduleName(event.target.value)}
                placeholder={t('schedule.editor.newSchedulePlaceholder')}
              />
              <Button onClick={() => createScheduleMutation.mutate()} disabled={createScheduleMutation.isPending}>
                {t('common.create')}
              </Button>
            </div>
          </div>

          <div className="md:col-span-3">
            {schedulesQuery.isLoading ? (
              <Skeleton className="h-8 w-full" />
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">
                  {t('schedule.editor.mode')}: {crdtEnabled ? `${t('sidebar.crdt', { state: t('common.enabled') })}` : `${t('sidebar.crdt', { state: t('common.disabled') })}`}
                </Badge>
                <Badge variant={isOnline ? 'default' : 'destructive'}>{t('schedule.editor.network')}: {isOnline ? t('users.statusOnline') : t('users.statusOffline')}</Badge>
                <Badge variant={syncStatus === 'online' ? 'default' : 'secondary'}>{t('schedule.editor.sync')}: {syncStatus}</Badge>
                <Badge variant={resyncStatus === 'requesting' ? 'secondary' : 'outline'}>{t('schedule.editor.resync')}: {resyncStatus}</Badge>
                <Badge variant={pending.length ? 'secondary' : 'default'}>{t('schedule.editor.pendingOps')}: {pending.length}</Badge>
                <Badge variant={selectedSlot ? 'outline' : 'secondary'}>
                  {t('schedule.editor.selectedSlot')}: {selectedSlot ? selectedSlot.slot_id.slice(0, 8) : t('schedule.editor.none')}
                </Badge>
                {!crdtEnabled ? <Badge variant={lockToken ? 'default' : 'secondary'}>{t('schedule.editor.lockState')}: {lockToken ? t('schedule.editor.lockAcquired') : t('schedule.editor.lockNotAcquired')}</Badge> : null}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {!activeSchedule && !schedulesQuery.isLoading ? (
        <EmptyState
          title={t('schedule.editor.emptyTitle')}
          description={t('schedule.editor.emptyDescription')}
        />
      ) : null}

      {activeSchedule ? (
        <Tabs defaultValue="timeline" className="space-y-4">
          <TabsList>
            <TabsTrigger value="timeline">{t('schedule.editor.tabTimeline')}</TabsTrigger>
            <TabsTrigger value="inspector">{t('schedule.editor.tabInspector')}</TabsTrigger>
            <TabsTrigger value="sync">{t('schedule.editor.tabSync')}</TabsTrigger>
          </TabsList>

          <TabsContent value="timeline" className="space-y-4">
            <Alert>
              <AlertTitle>{t('schedule.editor.scopeTitle')}</AlertTitle>
              <AlertDescription>
                {t('schedule.editor.scopeDescription')}
              </AlertDescription>
            </Alert>

            <Card>
              <CardHeader>
                <CardTitle>{t('schedule.editor.addSlot')}</CardTitle>
                <CardDescription>{t('schedule.editor.addSlotDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-7">
                <Input
                  placeholder="asset_id"
                  value={slotForm.asset_id}
                  onChange={(event) => setSlotForm((prev) => ({ ...prev, asset_id: event.target.value }))}
                />
                <Input
                  placeholder="publication_id"
                  value={slotForm.publication_id}
                  onChange={(event) => setSlotForm((prev) => ({ ...prev, publication_id: event.target.value }))}
                />
                <Input
                  type="datetime-local"
                  value={slotForm.start_time}
                  onChange={(event) => setSlotForm((prev) => ({ ...prev, start_time: event.target.value }))}
                />
                <Input
                  type="datetime-local"
                  value={slotForm.end_time}
                  onChange={(event) => setSlotForm((prev) => ({ ...prev, end_time: event.target.value }))}
                />
                <Input
                  type="number"
                  value={slotForm.priority}
                  onChange={(event) => setSlotForm((prev) => ({ ...prev, priority: event.target.value }))}
                />
                <Input
                  placeholder="group_id"
                  value={slotForm.group_id}
                  onChange={(event) => setSlotForm((prev) => ({ ...prev, group_id: event.target.value }))}
                />
                <Select
                  value={slotForm.zone_id || activeSchedule.zone_id}
                  onValueChange={(value) => setSlotForm((prev) => ({ ...prev, zone_id: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('schedule.editor.zone')} />
                  </SelectTrigger>
                  <SelectContent>
                    {timelineZones.map((zone) => (
                      <SelectItem key={zone.zone_id} value={zone.zone_id}>
                        {zone.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="md:col-span-7">
                  <Button onClick={addSlot}>{t('schedule.editor.createSlot')}</Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('schedule.editor.zoneTimeline')}</CardTitle>
                <CardDescription>{t('schedule.editor.zoneTimelineDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex rounded-md border p-1">
                    <Button size="sm" variant={viewMode === 'day' ? 'default' : 'ghost'} onClick={() => setViewMode('day')}>
                      {t('schedule.editor.day')}
                    </Button>
                    <Button size="sm" variant={viewMode === 'week' ? 'default' : 'ghost'} onClick={() => setViewMode('week')}>
                      {t('schedule.editor.week')}
                    </Button>
                  </div>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => setTimelineDate(format(addDays(timelineStartDate, viewMode === 'day' ? -1 : -7), 'yyyy-MM-dd'))}
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <Input
                    className="w-[180px]"
                    type="date"
                    value={timelineDate}
                    onChange={(event) => setTimelineDate(event.target.value)}
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => setTimelineDate(format(addDays(timelineStartDate, viewMode === 'day' ? 1 : 7), 'yyyy-MM-dd'))}
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                  {crdtEnabled ? (
                    <Button variant="outline" onClick={requestResync} disabled={syncStatus !== 'online'}>
                      <RefreshCw className={`size-4 ${resyncStatus === 'requesting' ? 'animate-spin' : ''}`} />
                      {t('schedule.editor.resyncButton')}
                    </Button>
                  ) : null}
                </div>

                <div className="space-y-4">
                  {timelineDays.map((day) => {
                    const dayKey = format(day, 'yyyy-MM-dd');
                    return (
                      <div key={dayKey} className="space-y-2">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <CalendarRange className="size-4 text-muted-foreground" />
                          {format(day, viewMode === 'day' ? 'EEEE, dd MMM yyyy' : 'EEE, dd MMM', { locale: dateLocale })}
                        </div>

                        {timelineZones.map((zone) => {
                          const laneKey = `${dayKey}|${zone.zone_id}`;
                          const segments = timelineSegments.get(laneKey) ?? [];

                          return (
                            <div key={laneKey} className="grid gap-2 md:grid-cols-[180px_minmax(0,1fr)]">
                              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                                <div className="font-medium">{zone.name}</div>
                                <div className="text-xs text-muted-foreground">{zone.zone_id.slice(0, 8)}</div>
                              </div>
                              <div className="overflow-x-auto">
                                <div className="relative h-20 rounded-md border bg-muted/10" style={{ width: `${TIMELINE_WIDTH}px` }}>
                                  {hourMarks.map((hour) => {
                                    const left = hour * 60 * PIXELS_PER_MINUTE;
                                    return (
                                      <div key={`${laneKey}-${hour}`} className="absolute inset-y-0" style={{ left }}>
                                        <div className="h-full border-l border-border/40" />
                                        <span className="absolute -top-5 -translate-x-1/2 text-[10px] text-muted-foreground">
                                          {hour}:00
                                        </span>
                                      </div>
                                    );
                                  })}

                                  {segments.map((segment, index) => {
                                    const outcome = priorityOutcomeBySlot.get(segment.slot.slot_id);
                                    const tone =
                                      outcome?.outcome === 'shadowed'
                                        ? 'border-amber-500/70 bg-amber-500/20 text-amber-900'
                                        : outcome?.outcome === 'winner'
                                          ? 'border-emerald-500/70 bg-emerald-500/20 text-emerald-900'
                                          : outcome?.outcome === 'tie'
                                            ? 'border-orange-500/70 bg-orange-500/20 text-orange-900'
                                            : 'border-primary/40 bg-primary/15 text-primary-foreground';

                                    return (
                                      <button
                                        key={segment.slot.slot_id}
                                        type="button"
                                        className={`absolute rounded border px-2 py-1 text-left text-[11px] transition ${tone} ${selectedSlotId === segment.slot.slot_id ? 'ring-2 ring-primary' : ''}`}
                                        style={{
                                          left: `${segment.left}px`,
                                          width: `${segment.width}px`,
                                          top: `${6 + (index % 3) * 18}px`
                                        }}
                                        onClick={() => setSelectedSlotId(segment.slot.slot_id)}
                                        title={`${segment.slot.publication_id || segment.slot.asset_id} | ${format(parseISO(segment.slot.start_time), 'HH:mm')} - ${format(parseISO(segment.slot.end_time), 'HH:mm')} | p${segment.slot.priority}${segment.clipped ? ' | clipped by day window' : ''}${outcome ? ` | ${outcome.reason}` : ''}`}
                                      >
                                        <div className="truncate font-semibold">{segment.slot.publication_id || segment.slot.asset_id}</div>
                                        <div className="truncate">
                                          {format(parseISO(segment.slot.start_time), 'HH:mm')} - {format(parseISO(segment.slot.end_time), 'HH:mm')} · p{segment.slot.priority}
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('schedule.editor.slotTable')}</CardTitle>
                <CardDescription>{t('schedule.editor.slotTableDesc')}</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('schedule.editor.slotId')}</TableHead>
                      <TableHead>{t('schedule.editor.contentRef')}</TableHead>
                      <TableHead>{t('schedule.editor.zone')}</TableHead>
                      <TableHead>{t('schedule.editor.timeRange')}</TableHead>
                      <TableHead>{t('schedule.editor.priority')}</TableHead>
                      <TableHead className="text-right">{t('users.tableActions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {localSlots.map((slot) => (
                      <TableRow key={slot.slot_id} className={selectedSlotId === slot.slot_id ? 'bg-muted/20' : ''}>
                        <TableCell className="font-mono text-xs">{slot.slot_id}</TableCell>
                        <TableCell>{slot.publication_id || slot.asset_id}</TableCell>
                        <TableCell className="font-mono text-xs">{slot.zone_id}</TableCell>
                        <TableCell className="text-xs">
                          {new Date(slot.start_time).toLocaleString()} - {new Date(slot.end_time).toLocaleString()}
                        </TableCell>
                        <TableCell>{slot.priority}</TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex flex-wrap justify-end gap-1">
                            <Button size="sm" variant="outline" onClick={() => setSelectedSlotId(slot.slot_id)}>
                              {t('schedule.editor.edit')}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const moved: ScheduleSlot = {
                                  ...slot,
                                  start_time: addMinutes(parseISO(slot.start_time), -15).toISOString(),
                                  end_time: addMinutes(parseISO(slot.end_time), -15).toISOString()
                                };
                                void updateLocalSlot(moved, 'move_slot');
                              }}
                            >
                              -15m
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const moved: ScheduleSlot = {
                                  ...slot,
                                  start_time: addMinutes(parseISO(slot.start_time), 15).toISOString(),
                                  end_time: addMinutes(parseISO(slot.end_time), 15).toISOString()
                                };
                                void updateLocalSlot(moved, 'move_slot');
                              }}
                            >
                              +15m
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => void removeLocalSlot(slot)}>
                              {t('schedule.editor.delete')}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="inspector" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{t('schedule.editor.validateTitle')}</CardTitle>
                <CardDescription>{t('schedule.editor.validateDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid gap-3 sm:grid-cols-3">
                  <InfoLine label={t('schedule.editor.lockOwner')} value={lockOwner || '—'} />
                  <InfoLine label={t('schedule.editor.lockTtl')} value={lockTtl} />
                  <InfoLine label={t('schedule.editor.scheduleVersion')} value={String(activeSchedule.current_version)} />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <InfoLine label={t('schedule.editor.lastValidate')} value={lastValidationAt ? new Date(lastValidationAt).toLocaleString() : '—'} />
                  <InfoLine label={t('schedule.editor.lastPublish')} value={lastPublishAt ? new Date(lastPublishAt).toLocaleString() : '—'} />
                  <InfoLine label={t('schedule.editor.lastResync')} value={lastResyncAt ? new Date(lastResyncAt).toLocaleString() : '—'} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => validateMutation.mutate()} disabled={validateMutation.isPending}>
                    {t('schedule.editor.qaValidate')}
                  </Button>
                  <Button onClick={() => publishMutation.mutate()} disabled={publishMutation.isPending || (!crdtEnabled && !lockToken)}>
                    {t('schedule.editor.publishRelease')}
                  </Button>
                  {releaseInfo ? (
                    <Button variant="outline" asChild>
                      <Link href="/audit">{t('schedule.editor.openAudit')}</Link>
                    </Button>
                  ) : null}
                </div>

                <Separator />
                {releaseInfo ? (
                  <Alert variant="default">
                    <AlertTitle>{t('schedule.editor.lastRelease')}</AlertTitle>
                    <AlertDescription>
                      {t('schedule.editor.releaseSummary', {
                        releaseId: releaseInfo.releaseId,
                        status: releaseInfo.rolloutStatus,
                      })}
                    </AlertDescription>
                  </Alert>
                ) : (
                  <p className="text-sm text-muted-foreground">{t('schedule.editor.noReleaseInfo')}</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('schedule.editor.selectedSlotEditor')}</CardTitle>
                <CardDescription>{t('schedule.editor.selectedSlotEditorDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedSlot ? (
                  <>
                    <div className="grid gap-3 md:grid-cols-4">
                      <Input
                        placeholder="asset_id"
                        value={slotDraft.asset_id}
                        onChange={(event) => setSlotDraft((prev) => ({ ...prev, asset_id: event.target.value }))}
                      />
                      <Input
                        placeholder="publication_id"
                        value={slotDraft.publication_id}
                        onChange={(event) => setSlotDraft((prev) => ({ ...prev, publication_id: event.target.value }))}
                      />
                      <Input
                        type="datetime-local"
                        value={slotDraft.start_time}
                        onChange={(event) => setSlotDraft((prev) => ({ ...prev, start_time: event.target.value }))}
                      />
                      <Input
                        type="datetime-local"
                        value={slotDraft.end_time}
                        onChange={(event) => setSlotDraft((prev) => ({ ...prev, end_time: event.target.value }))}
                      />
                      <Input
                        type="number"
                        value={slotDraft.priority}
                        onChange={(event) => setSlotDraft((prev) => ({ ...prev, priority: event.target.value }))}
                      />
                      <Input
                        placeholder="group_id"
                        value={slotDraft.group_id}
                        onChange={(event) => setSlotDraft((prev) => ({ ...prev, group_id: event.target.value }))}
                      />
                      <Select
                        value={slotDraft.zone_id || activeSchedule.zone_id}
                        onValueChange={(value) => setSlotDraft((prev) => ({ ...prev, zone_id: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t('schedule.editor.zone')} />
                        </SelectTrigger>
                        <SelectContent>
                          {timelineZones.map((zone) => (
                            <SelectItem key={zone.zone_id} value={zone.zone_id}>
                              {zone.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <Separator className="my-2" />
                    <p className="text-xs font-semibold text-muted-foreground">{t('schedule.editor.transitionVideo')}</p>
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="space-y-1">
                        <Label className="text-xs">{t('schedule.editor.transition')}</Label>
                        <Select
                          value={slotDraft.transition_type}
                          onValueChange={(value) =>
                            setSlotDraft((prev) => ({ ...prev, transition_type: value as 'cut' | 'fade' }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cut">{t('schedule.editor.cut')}</SelectItem>
                            <SelectItem value="fade">{t('schedule.editor.fade')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{t('schedule.editor.fadeDuration')}</Label>
                        <Input
                          type="number"
                          min={0}
                          value={slotDraft.transition_duration_ms}
                          disabled={slotDraft.transition_type !== 'fade'}
                          onChange={(event) =>
                            setSlotDraft((prev) => ({ ...prev, transition_duration_ms: event.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{t('schedule.editor.trimIn')}</Label>
                        <Input
                          type="number"
                          min={0}
                          value={slotDraft.video_trim_in_ms}
                          onChange={(event) =>
                            setSlotDraft((prev) => ({ ...prev, video_trim_in_ms: event.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{t('schedule.editor.trimOut')}</Label>
                        <Input
                          type="number"
                          min={0}
                          value={slotDraft.video_trim_out_ms}
                          onChange={(event) =>
                            setSlotDraft((prev) => ({ ...prev, video_trim_out_ms: event.target.value }))
                          }
                        />
                      </div>
                      <div className="flex items-center gap-4 md:col-span-2">
                        <label className="flex items-center gap-1.5 text-xs">
                          <input
                            type="checkbox"
                            checked={slotDraft.video_mute}
                            onChange={(event) =>
                              setSlotDraft((prev) => ({ ...prev, video_mute: event.target.checked }))
                            }
                            className="accent-primary h-4 w-4 rounded"
                          />
                          {t('schedule.editor.muteVideo')}
                        </label>
                        <label className="flex items-center gap-1.5 text-xs">
                          <input
                            type="checkbox"
                            checked={slotDraft.video_loop}
                            onChange={(event) =>
                              setSlotDraft((prev) => ({ ...prev, video_loop: event.target.checked }))
                            }
                            className="accent-primary h-4 w-4 rounded"
                          />
                          {t('schedule.editor.loopVideo')}
                        </label>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={() => void saveSelectedSlotDraft()}>
                        {t('schedule.editor.saveMetadata')}
                      </Button>
                      <Button variant="outline" onClick={() => void shiftSelectedSlot(-15)}>
                        {t('schedule.editor.moveMinus15')}
                      </Button>
                      <Button variant="outline" onClick={() => void shiftSelectedSlot(15)}>
                        {t('schedule.editor.movePlus15')}
                      </Button>
                      <Button variant="outline" onClick={() => void resizeSelectedSlot(-15)}>
                        {t('schedule.editor.durationMinus15')}
                      </Button>
                      <Button variant="outline" onClick={() => void resizeSelectedSlot(15)}>
                        {t('schedule.editor.durationPlus15')}
                      </Button>
                      <Button variant="ghost" onClick={() => void removeLocalSlot(selectedSlot)}>
                        {t('schedule.editor.deleteSlot')}
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">{t('schedule.editor.selectSlotFirst')}</p>
                )}
              </CardContent>
            </Card>

            {priorityAlerts.length ? (
              <Alert variant="default">
                <AlertTitle>{t('schedule.editor.priorityOutcomes')}</AlertTitle>
                <AlertDescription>
                  {priorityAlerts.map((item) => `${item.outcome.toUpperCase()} ${item.slotId.slice(0, 8)}: ${item.reason}`).join(' | ')}
                </AlertDescription>
              </Alert>
            ) : (
              <Alert>
                <AlertTitle>{t('schedule.editor.priorityOutcomes')}</AlertTitle>
                <AlertDescription>{t('schedule.editor.noOverlaps')}</AlertDescription>
              </Alert>
            )}

            {qaIssues.length ? (
              <Alert variant={qaIssues.some((issue) => issue.severity === 'error') ? 'destructive' : 'default'}>
                <AlertTitle>{t('schedule.editor.qaIssues')}</AlertTitle>
                <AlertDescription>
                  {qaIssues.map((issue) => `${issue.severity.toUpperCase()} ${issue.code}: ${issue.message}`).join(' | ')}
                </AlertDescription>
              </Alert>
            ) : (
              <Alert>
                <AlertTitle>{t('schedule.editor.qaResult')}</AlertTitle>
                <AlertDescription>{t('schedule.editor.qaNoIssues')}</AlertDescription>
              </Alert>
            )}
          </TabsContent>

          <TabsContent value="sync" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{t('schedule.editor.crdtStream')}</CardTitle>
                <CardDescription>{t('schedule.editor.crdtStreamDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-3">
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">{t('schedule.editor.rejected')}</h4>
                  {rejected.length ? (
                    rejected.map((row) => (
                      <div key={row.operation_id} className="rounded border border-destructive/30 p-2 text-xs">
                        <div className="font-mono">{row.operation_id}</div>
                        <StatusBadge tone="danger" label={row.reason} />
                        {row.explanation ? <div className="mt-1 text-muted-foreground">{row.explanation}</div> : null}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">{t('schedule.editor.noRejected')}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">{t('schedule.editor.autoTransform')}</h4>
                  {transforms.length ? (
                    transforms.map((row) => (
                      <div key={`${row.operation_id}-${row.reason}`} className="rounded border p-2 text-xs">
                        <div className="font-mono">{row.operation_id}</div>
                        <StatusBadge tone="warning" label={row.reason} />
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">{t('schedule.editor.noTransforms')}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">{t('schedule.editor.pending')}</h4>
                  {pending.length ? (
                    pending.slice(0, 20).map((item) => (
                      <div key={item.operationId} className="rounded border p-2 text-xs">
                        <div className="font-mono">{item.op.causal.operation_id}</div>
                        <div className="mt-1 flex gap-2">
                          <StatusBadge tone="neutral" label={item.op.op_type} />
                          <StatusBadge
                            tone={isOnline ? 'success' : 'warning'}
                            label={
                              isOnline
                                ? t('users.statusOnline')
                                : t('users.statusOffline')
                            }
                          />
                        </div>
                        <div className="mt-1 text-muted-foreground">
                          slot: <span className="font-mono">{item.op.slot.slot_id}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">{t('schedule.editor.noPending')}</p>
                  )}
                </div>

                {crdtEnabled ? (
                  <div className="md:col-span-3 flex flex-wrap gap-2">
                    <Button variant="outline" onClick={requestResync} disabled={syncStatus !== 'online'}>
                      {t('schedule.editor.forceResync')}
                    </Button>
                    <Button variant="outline" disabled={!pending.length} onClick={() => opsBatchMutation.mutate()}>
                      {t('schedule.editor.flushPending')}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={async () => {
                        revertLast();
                        await clearSchedule();
                        clearAll();
                      }}
                    >
                      {t('schedule.editor.revertPending')}
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      ) : null}
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
