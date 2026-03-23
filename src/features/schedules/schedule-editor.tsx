'use client';

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { getAccessToken } from '@/auth/token-store';
import { useAuthStore } from '@/auth/store';
import { useCrdtStore } from '@/features/schedules/crdt-store';
import { isPublishBlockedByValidation } from '@/features/schedules/validation-flow';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { env } from '@/lib/env';
import { queryKeys } from '@/lib/query-keys';
import { useCrdtQueue } from '@/hooks/use-crdt-queue';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { contentService } from '@/services/content-service';
import { publicationService } from '@/services/publication-service';
import { scheduleService } from '@/services/schedule-service';
import { WsSyncClient, type SyncStatus } from '@/services/ws-client';
import { zoneService } from '@/services/zone-service';
import type { ScheduleOp, ScheduleSlot, ValidationIssue } from '@/types/api';

type ScheduleEditorProps = {
  scheduleId: string;
};

type WorkspaceTab = 'calendar' | 'timeline';
type TimelineView = 'day' | 'week';
type SlotSource = 'publication' | 'asset';
type ResizeEdge = 'start' | 'end';

type CalendarCell = {
  date: string;
  inCurrentMonth: boolean;
  dayOfMonth: number;
};

type SlotDraft = {
  slot_id?: string;
  source: SlotSource;
  publication_id: string;
  asset_id: string;
  start_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  priority: string;
  group_id: string;
  zone_id: string;
};

type LaneSegment = {
  slot: ScheduleSlot;
  startMinutes: number;
  endMinutes: number;
  left: number;
  width: number;
  clipped: boolean;
};

type PositionedLaneSegment = LaneSegment & {
  laneIndex: number;
};

type TimelineLaneLayout = {
  segments: PositionedLaneSegment[];
  laneCount: number;
};

type CalendarDragMode = 'move' | 'resize-start' | 'resize-end';

type CalendarDragState = {
  slotId: string;
  mode: CalendarDragMode;
};

type CalendarWeekSegment = {
  slot: ScheduleSlot;
  startCol: number;
  endCol: number;
  clippedStart: boolean;
  clippedEnd: boolean;
  laneIndex: number;
};

type CalendarWeekLayout = {
  segments: CalendarWeekSegment[];
  laneCount: number;
};

type PointerState =
  | {
      mode: 'create';
      date: string;
      originX: number;
      laneWidth: number;
      startMinutes: number;
      currentMinutes: number;
    }
  | {
      mode: 'resize';
      slotId: string;
      date: string;
      edge: ResizeEdge;
      originX: number;
      laneWidth: number;
      startMinutes: number;
      endMinutes: number;
    }
  | {
      mode: 'move';
      slotId: string;
      date: string;
      originX: number;
      laneWidth: number;
      startMinutes: number;
      endMinutes: number;
    };

const MINUTES_IN_DAY = 24 * 60;
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_SLOT_MINUTES = 15;
const POINTER_STEP_MINUTES = 15;
const PIXELS_PER_MINUTE = 1.05;
const TIMELINE_WIDTH = MINUTES_IN_DAY * PIXELS_PER_MINUTE;
const TIMELINE_SLOT_HEIGHT = 34;
const TIMELINE_SLOT_GAP = 8;
const TIMELINE_LANE_PADDING_Y = 8;
const TIMELINE_MIN_LANE_HEIGHT = 80;
const CALENDAR_SLOT_HEIGHT = 24;
const CALENDAR_SLOT_GAP = 4;
const CALENDAR_DAY_HEADER_HEIGHT = 30;
const CALENDAR_EMPTY_ROW_HEIGHT = 118;
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_OPTIONS = [
  { value: 0, label: 'Январь' },
  { value: 1, label: 'Февраль' },
  { value: 2, label: 'Март' },
  { value: 3, label: 'Апрель' },
  { value: 4, label: 'Май' },
  { value: 5, label: 'Июнь' },
  { value: 6, label: 'Июль' },
  { value: 7, label: 'Август' },
  { value: 8, label: 'Сентябрь' },
  { value: 9, label: 'Октябрь' },
  { value: 10, label: 'Ноябрь' },
  { value: 11, label: 'Декабрь' },
];

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

function todayDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeDateKey(value: string): string {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return todayDateKey();
  return parsed.toISOString().slice(0, 10);
}

function monthAnchor(date: string): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return `${todayDateKey().slice(0, 7)}-01`;
  return `${parsed.getUTCFullYear()}-${pad2(parsed.getUTCMonth() + 1)}-01`;
}

function shiftMonth(anchorDate: string, diff: number): string {
  const parsed = new Date(`${anchorDate}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return monthAnchor(todayDateKey());
  parsed.setUTCMonth(parsed.getUTCMonth() + diff, 1);
  return `${parsed.getUTCFullYear()}-${pad2(parsed.getUTCMonth() + 1)}-01`;
}

function startOfWeekMonday(date: string): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return todayDateKey();
  const weekDay = (parsed.getUTCDay() + 6) % 7;
  parsed.setUTCDate(parsed.getUTCDate() - weekDay);
  return parsed.toISOString().slice(0, 10);
}

function addDays(date: string, diff: number): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  parsed.setUTCDate(parsed.getUTCDate() + diff);
  return parsed.toISOString().slice(0, 10);
}

function timeToMinutes(time: string): number {
  const [hoursRaw, minutesRaw] = time.split(':');
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
  return clamp(hours * 60 + minutes, 0, MINUTES_IN_DAY);
}

function minutesToTime(minutes: number): string {
  const safe = clamp(Math.round(minutes), 0, MINUTES_IN_DAY);
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  return `${pad2(hours)}:${pad2(mins)}`;
}

function toIsoAtMinutes(date: string, minutes: number): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  parsed.setUTCMinutes(minutes, 0, 0);
  return parsed.toISOString();
}

function toIsoFromDraft(date: string, time: string): string {
  return toIsoAtMinutes(date, timeToMinutes(time));
}

function isoToDateKey(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return todayDateKey();
  return parsed.toISOString().slice(0, 10);
}

function isoToTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '00:00';
  return `${pad2(parsed.getUTCHours())}:${pad2(parsed.getUTCMinutes())}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatDayLabel(date: string): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat('ru-RU', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  }).format(parsed);
}

function formatMonthYear(anchor: string): string {
  const parsed = new Date(`${anchor}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return anchor;
  return new Intl.DateTimeFormat('ru-RU', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed);
}

function buildMonthCells(anchor: string): CalendarCell[] {
  const parsed = new Date(`${anchor}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return [];

  const monthStart = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 0));
  const startWeekday = (monthStart.getUTCDay() + 6) % 7;
  const endWeekday = (monthEnd.getUTCDay() + 6) % 7;

  const gridStart = new Date(monthStart);
  gridStart.setUTCDate(gridStart.getUTCDate() - startWeekday);
  const gridEnd = new Date(monthEnd);
  gridEnd.setUTCDate(gridEnd.getUTCDate() + (6 - endWeekday));

  const cells: CalendarCell[] = [];
  for (const cursor = new Date(gridStart); cursor <= gridEnd; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    cells.push({
      date: cursor.toISOString().slice(0, 10),
      inCurrentMonth: cursor.getUTCMonth() === parsed.getUTCMonth(),
      dayOfMonth: cursor.getUTCDate(),
    });
  }

  return cells;
}

function clampSlotToDate(slot: ScheduleSlot, date: string): { startMinutes: number; endMinutes: number; clipped: boolean } | null {
  const dayStart = Date.parse(`${date}T00:00:00.000Z`);
  const dayEnd = dayStart + DAY_MS;
  const slotStart = Date.parse(slot.start_time);
  const slotEnd = Date.parse(slot.end_time);

  if (!Number.isFinite(slotStart) || !Number.isFinite(slotEnd) || slotEnd <= dayStart || slotStart >= dayEnd) {
    return null;
  }

  const clampedStart = Math.max(slotStart, dayStart);
  const clampedEnd = Math.min(slotEnd, dayEnd);
  const startMinutes = clamp(Math.floor((clampedStart - dayStart) / 60000), 0, MINUTES_IN_DAY);
  const endMinutes = clamp(Math.ceil((clampedEnd - dayStart) / 60000), 0, MINUTES_IN_DAY);

  if (endMinutes <= startMinutes) return null;

  return {
    startMinutes,
    endMinutes,
    clipped: slotStart < dayStart || slotEnd > dayEnd,
  };
}

function dateKeyToUtcMs(date: string): number {
  return Date.parse(`${date}T00:00:00.000Z`);
}

function diffDateKeys(from: string, to: string): number {
  const fromMs = dateKeyToUtcMs(from);
  const toMs = dateKeyToUtcMs(to);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return 0;
  return Math.round((toMs - fromMs) / DAY_MS);
}

function shiftIsoByDays(value: string, diffDaysCount: number): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  parsed.setUTCDate(parsed.getUTCDate() + diffDaysCount);
  return parsed.toISOString();
}

function replaceIsoDatePart(value: string, date: string): string {
  const current = new Date(value);
  const nextDate = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(current.getTime()) || Number.isNaN(nextDate.getTime())) return value;
  nextDate.setUTCHours(
    current.getUTCHours(),
    current.getUTCMinutes(),
    current.getUTCSeconds(),
    current.getUTCMilliseconds(),
  );
  return nextDate.toISOString();
}

function assignTimelineLanes(segments: LaneSegment[]): TimelineLaneLayout {
  const laneEnds: number[] = [];
  const positioned: PositionedLaneSegment[] = segments.map((segment) => {
    let laneIndex = 0;
    while (laneIndex < laneEnds.length && segment.startMinutes < laneEnds[laneIndex]) {
      laneIndex += 1;
    }
    laneEnds[laneIndex] = segment.endMinutes;
    return { ...segment, laneIndex };
  });
  return { segments: positioned, laneCount: laneEnds.length };
}

function timelineLaneHeight(laneCount: number): number {
  if (laneCount <= 0) return TIMELINE_MIN_LANE_HEIGHT;
  return Math.max(
    TIMELINE_MIN_LANE_HEIGHT,
    TIMELINE_LANE_PADDING_Y * 2 + laneCount * TIMELINE_SLOT_HEIGHT + (laneCount - 1) * TIMELINE_SLOT_GAP,
  );
}

function assignCalendarLanes(segments: Array<Omit<CalendarWeekSegment, 'laneIndex'>>): CalendarWeekLayout {
  const laneEnds: number[] = [];
  const positioned: CalendarWeekSegment[] = segments.map((segment) => {
    let laneIndex = 0;
    while (laneIndex < laneEnds.length && segment.startCol < laneEnds[laneIndex]) {
      laneIndex += 1;
    }
    laneEnds[laneIndex] = segment.endCol;
    return { ...segment, laneIndex };
  });

  return {
    segments: positioned,
    laneCount: laneEnds.length,
  };
}

function parseCalendarDragPayload(payload: string): CalendarDragState | null {
  const [slotId, mode] = payload.split('::');
  if (!slotId) return null;
  if (mode !== 'move' && mode !== 'resize-start' && mode !== 'resize-end') return null;
  return { slotId, mode };
}

function emptySlotDraft(zoneId: string, date: string): SlotDraft {
  return {
    source: 'publication',
    publication_id: '',
    asset_id: '',
    start_date: date,
    start_time: '09:00',
    end_date: date,
    end_time: '10:00',
    priority: '1',
    group_id: '',
    zone_id: zoneId,
  };
}

function slotToDraft(slot: ScheduleSlot): SlotDraft {
  return {
    slot_id: slot.slot_id,
    source: slot.publication_id ? 'publication' : 'asset',
    publication_id: slot.publication_id || '',
    asset_id: slot.asset_id || '',
    start_date: isoToDateKey(slot.start_time),
    start_time: isoToTime(slot.start_time),
    end_date: isoToDateKey(slot.end_time),
    end_time: isoToTime(slot.end_time),
    priority: String(slot.priority),
    group_id: slot.group_id || '',
    zone_id: slot.zone_id,
  };
}

function scheduleTone(status: 'draft' | 'locked' | 'published'): 'success' | 'warning' | 'neutral' {
  if (status === 'published') return 'success';
  if (status === 'locked') return 'warning';
  return 'neutral';
}

function sortObjectKeys(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function slotsFingerprint(slots: ScheduleSlot[]): string {
  const normalized = slots
    .map((slot) => ({
      slot_id: slot.slot_id,
      asset_id: slot.asset_id || '',
      publication_id: slot.publication_id || '',
      start_time: slot.start_time,
      end_time: slot.end_time,
      priority: slot.priority,
      zone_id: slot.zone_id,
      group_id: slot.group_id || '',
      metadata:
        slot.metadata && typeof slot.metadata === 'object'
          ? sortObjectKeys(slot.metadata as Record<string, unknown>)
          : {},
    }))
    .sort((left, right) => left.slot_id.localeCompare(right.slot_id));
  return JSON.stringify(normalized);
}

export function ScheduleEditor({ scheduleId }: ScheduleEditorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const today = todayDateKey();

  const urlTab = searchParams.get('tab');
  const activeTab: WorkspaceTab = urlTab === 'timeline' ? 'timeline' : 'calendar';
  const selectedDate = normalizeDateKey(searchParams.get('date') || today);
  const calendarDate = monthAnchor(selectedDate);

  const setWorkspaceState = useCallback(
    (nextTab: WorkspaceTab, nextDate: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', nextTab);
      params.set('date', normalizeDateKey(nextDate));
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const [timelineView, setTimelineView] = useState<TimelineView>('day');
  const [selectedSlotId, setSelectedSlotId] = useState('');
  const [slotDraft, setSlotDraft] = useState<SlotDraft>(() => emptySlotDraft('', selectedDate));
  const [localSlots, setLocalSlots] = useState<ScheduleSlot[]>([]);
  const [lockToken, setLockToken] = useState('');
  const [lockOwner, setLockOwner] = useState('');
  const [lockExpiresAt, setLockExpiresAt] = useState('');
  const [qaIssues, setQaIssues] = useState<ValidationIssue[]>([]);
  const [releaseInfo, setReleaseInfo] = useState<{ releaseId: string; rolloutStatus: string } | null>(null);
  const [resyncStatus, setResyncStatus] = useState<'idle' | 'requesting' | 'received'>('idle');
  const [timelineDraftRange, setTimelineDraftRange] = useState<{ date: string; start: number; end: number } | null>(null);
  const [activePointerSlotId, setActivePointerSlotId] = useState('');
  const [calendarDragState, setCalendarDragState] = useState<CalendarDragState | null>(null);

  const crdtEnabled = useAuthStore((state) => state.crdtEnabled);
  const currentUserId = useAuthStore((state) => state.user?.id);

  const { isOnline } = useNetworkStatus();
  const { pushOp, setRejected, setTransform } = useCrdtStore();
  const { pending, enqueue, dequeueMany } = useCrdtQueue(scheduleId);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');

  const wsRef = useRef<WsSyncClient | null>(null);
  const pointerStateRef = useRef<PointerState | null>(null);
  const localSlotsRef = useRef<ScheduleSlot[]>([]);
  const isSyncingRef = useRef(false);
  const isSendingRef = useRef(false);
  const prevSyncStatusRef = useRef<SyncStatus>('idle');
  const lastKnownOpIdRef = useRef<string | undefined>(undefined);
  const bufferedRemoteOpsRef = useRef<Array<{ op_type: string; slot: ScheduleSlot; causal?: { operation_id?: string } }>>([]);
  const seenOperationIdsRef = useRef<Set<string>>(new Set());
  const lamportRef = useRef(0);
  const editorSessionIdRef = useRef(`workspace-${crypto.randomUUID()}`);

  useEffect(() => {
    localSlotsRef.current = localSlots;
  }, [localSlots]);

  const scheduleQuery = useQuery({
    queryKey: queryKeys.schedule(scheduleId),
    queryFn: () => scheduleService.getSchedule(scheduleId),
  });
  const schedule = scheduleQuery.data ?? null;
  const zoneId = schedule?.zone_id || '';

  const zonesQuery = useQuery({
    queryKey: queryKeys.zones,
    queryFn: zoneService.listZones,
  });

  const groupsQuery = useQuery({
    queryKey: zoneId ? queryKeys.zoneGroups(zoneId) : ['groups', 'none'],
    queryFn: () => zoneService.listGroups(zoneId),
    enabled: Boolean(zoneId),
  });

  const publicationsQuery = useQuery({
    queryKey: zoneId ? ['publications', zoneId] : ['publications', 'none'],
    queryFn: () => publicationService.list(zoneId),
    enabled: Boolean(zoneId),
  });

  const assetsQuery = useQuery({
    queryKey: zoneId ? queryKeys.content(zoneId) : ['content', 'none'],
    queryFn: () => contentService.list(zoneId),
    enabled: Boolean(zoneId),
  });

  const calendarQuery = useQuery({
    queryKey: queryKeys.scheduleCalendar(scheduleId, 'month', calendarDate),
    queryFn: () => scheduleService.getCalendar(scheduleId, { view: 'month', date: calendarDate }),
    enabled: Boolean(scheduleId),
  });

  const zoneName = useMemo(
    () => zonesQuery.data?.find((zone) => zone.zone_id === zoneId)?.name ?? 'Unknown zone',
    [zoneId, zonesQuery.data],
  );

  const publicationById = useMemo(
    () => new Map((publicationsQuery.data ?? []).map((publication) => [publication.publication_id, publication.title])),
    [publicationsQuery.data],
  );
  const assetById = useMemo(
    () => new Map((assetsQuery.data ?? []).map((asset) => [asset.asset_id, asset.filename])),
    [assetsQuery.data],
  );

  const slotLabel = useCallback(
    (slot: ScheduleSlot) => {
      if (slot.publication_id) {
        return publicationById.get(slot.publication_id) ?? 'Publication';
      }
      if (slot.asset_id) {
        return assetById.get(slot.asset_id) ?? 'Asset';
      }
      return 'Без контента';
    },
    [assetById, publicationById],
  );

  useEffect(() => {
    if (!schedule) return;
    setLocalSlots(schedule.slots ?? []);
    setSelectedSlotId('');
    setSlotDraft((prev) => emptySlotDraft(schedule.zone_id, prev.start_date || selectedDate));
  }, [schedule, schedule?.current_version, schedule?.schedule_id, schedule?.slots, schedule?.zone_id, selectedDate]);

  const selectedSlot = useMemo(
    () => localSlots.find((slot) => slot.slot_id === selectedSlotId) ?? null,
    [localSlots, selectedSlotId],
  );
  const persistedFingerprint = useMemo(() => slotsFingerprint(schedule?.slots ?? []), [schedule?.slots]);
  const localFingerprint = useMemo(() => slotsFingerprint(localSlots), [localSlots]);
  const hasUnsavedChanges = persistedFingerprint !== localFingerprint;

  useEffect(() => {
    if (selectedSlot) {
      setSlotDraft(slotToDraft(selectedSlot));
      return;
    }
    setSlotDraft((prev) => ({
      ...prev,
      slot_id: undefined,
      zone_id: prev.zone_id || zoneId,
      start_date: selectedDate,
      end_date: selectedDate,
    }));
  }, [selectedDate, selectedSlot, zoneId]);

  const rememberOperationId = useCallback((operationId?: string | null) => {
    if (!operationId) return;
    const seen = seenOperationIdsRef.current;
    seen.add(operationId);

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
              const index = next.findIndex((slot) => slot.slot_id === op.slot.slot_id);
              if (index >= 0) {
                next = [...next];
                next[index] = { ...next[index], ...op.slot };
              }
              break;
            }
            case 'move_slot': {
              const index = next.findIndex((slot) => slot.slot_id === op.slot.slot_id);
              if (index >= 0) {
                next = [...next];
                next[index] = { ...next[index], start_time: op.slot.start_time, end_time: op.slot.end_time };
              }
              break;
            }
          }
        }
        return next;
      });
    },
    [rememberOperationId],
  );

  const signPendingOps = useCallback(async () => {
    if (!pending.length) return [];
    return scheduleService.signOps(
      scheduleId,
      pending.map((item) => item.op),
    );
  }, [pending, scheduleId]);

  const opsBatchMutation = useMutation({
    mutationFn: async () => {
      if (!pending.length) return null;
      const signedOps = await signPendingOps();
      if (!signedOps.length) return null;
      return scheduleService.ingestOps(scheduleId, signedOps);
    },
    onSuccess: async (result) => {
      if (!result) return;
      const rows = result.results ?? [];
      const ackedIds = rows.filter((row) => row.accepted).map((row) => row.operation_id);
      const duplicateIds = rows
        .filter((row) => !row.accepted && (row.reason === 'duplicate_operation' || row.reason === 'already_applied'))
        .map((row) => row.operation_id);
      const rejectedRows = rows.filter(
        (row) => !row.accepted && row.reason !== 'duplicate_operation' && row.reason !== 'already_applied',
      );

      const settledIds = [...ackedIds, ...duplicateIds];
      settledIds.forEach((id) => rememberOperationId(id));
      await dequeueMany(settledIds);

      for (const row of rejectedRows) {
        setRejected({
          operation_id: row.operation_id,
          reason: row.reason ?? 'unknown',
          explanation: row.explanation,
        });
      }

      if (result.rejected > 0) {
        toast.error(`Отклонено операций: ${result.rejected}`);
      }
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Не удалось синхронизировать операции'),
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
          client_id: `workspace:${userId}`,
          lamport_ts: ++lamportRef.current,
          session_id: sessionId,
        },
        actor: {
          auth_type: 'user_session',
          user_id: userId,
          session_id: sessionId,
        },
        slot,
      };
      pushOp(op);
      await enqueue(op);
    },
    [crdtEnabled, currentUserId, enqueue, pushOp],
  );

  const addLocalSlot = useCallback(
    async (slot: ScheduleSlot) => {
      setLocalSlots((prev) => [...prev, slot]);
      await emitCrdtOp('add_slot', slot);
    },
    [emitCrdtOp],
  );

  const updateLocalSlot = useCallback(
    async (slot: ScheduleSlot, opType: ScheduleOp['op_type'] = 'update_slot') => {
      setLocalSlots((prev) => prev.map((item) => (item.slot_id === slot.slot_id ? slot : item)));
      await emitCrdtOp(opType, slot);
    },
    [emitCrdtOp],
  );

  const removeLocalSlot = useCallback(
    async (slot: ScheduleSlot) => {
      setLocalSlots((prev) => prev.filter((item) => item.slot_id !== slot.slot_id));
      setSelectedSlotId((prev) => (prev === slot.slot_id ? '' : prev));
      await emitCrdtOp('remove_slot', slot);
    },
    [emitCrdtOp],
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
            explanation: payload.explanation,
          });
        },
        onTransform: (payload) => {
          setTransform({ operation_id: payload.operation_id, reason: payload.reason });
        },
        onSnapshot: async (payload) => {
          if (!payload.slots) return;

          isSyncingRef.current = true;
          try {
            setLocalSlots(payload.slots as ScheduleSlot[]);

            if (payload.last_operation_id) {
              rememberOperationId(payload.last_operation_id);
            }

            const missingOpIds = (payload.missing_ops || [])
              .map((op) => op?.operation_id)
              .filter((id): id is string => Boolean(id));
            if (missingOpIds.length > 0) {
              missingOpIds.forEach((id) => rememberOperationId(id));
              await dequeueMany(missingOpIds);
            }

            if (bufferedRemoteOpsRef.current.length > 0) {
              applyOpsToLocalState(bufferedRemoteOpsRef.current);
              bufferedRemoteOpsRef.current = [];
            }
          } finally {
            isSyncingRef.current = false;
            setResyncStatus('received');
          }
        },
        onRemoteOps: async (payload) => {
          if (!Array.isArray(payload.ops)) return;
          const ops = payload.ops as Array<{ op_type: string; slot: ScheduleSlot; causal?: { operation_id?: string } }>;

          if (isSyncingRef.current) {
            bufferedRemoteOpsRef.current.push(...ops);
            return;
          }

          applyOpsToLocalState(ops);

          const remotelyAcknowledged = ops.map((op) => op.causal?.operation_id).filter((id): id is string => Boolean(id));
          if (remotelyAcknowledged.length > 0) {
            await dequeueMany(remotelyAcknowledged);
          }
        },
      },
    });

    client.connect();
    wsRef.current = client;

    return () => {
      client.disconnect();
      wsRef.current = null;
    };
  }, [applyOpsToLocalState, crdtEnabled, dequeueMany, isOnline, rememberOperationId, setRejected, setTransform]);

  useEffect(() => {
    const wasOffline = prevSyncStatusRef.current === 'offline' || prevSyncStatusRef.current === 'idle';
    prevSyncStatusRef.current = syncStatus;

    if (wasOffline && syncStatus === 'online' && wsRef.current && !isSyncingRef.current) {
      isSyncingRef.current = true;
      setResyncStatus('requesting');
      wsRef.current.requestSync(scheduleId, lastKnownOpIdRef.current);
    }
  }, [scheduleId, syncStatus]);

  useEffect(() => {
    if (!crdtEnabled || !isOnline || !pending.length) return;
    if (isSyncingRef.current || isSendingRef.current) return;

    isSendingRef.current = true;

    void (async () => {
      let sentViaHttp = false;
      try {
        const signedOps = await signPendingOps();
        if (!signedOps.length) return;

        if (wsRef.current && syncStatus === 'online') {
          wsRef.current.sendOps(scheduleId, signedOps);
          return;
        }

        sentViaHttp = true;
        await opsBatchMutation.mutateAsync();
      } catch {
        if (!sentViaHttp) {
          try {
            await opsBatchMutation.mutateAsync();
          } catch {
            // surfaced via mutation callbacks
          }
        }
      } finally {
        isSendingRef.current = false;
      }
    })();
  }, [crdtEnabled, isOnline, opsBatchMutation, opsBatchMutation.mutateAsync, pending, scheduleId, signPendingOps, syncStatus]);

  const requestResync = useCallback(() => {
    if (!wsRef.current || syncStatus !== 'online') {
      toast.error('Sync websocket не подключен');
      return;
    }
    try {
      isSyncingRef.current = true;
      setResyncStatus('requesting');
      wsRef.current.requestSync(scheduleId, lastKnownOpIdRef.current);
    } catch (error) {
      isSyncingRef.current = false;
      toast.error(error instanceof Error ? error.message : 'Не удалось запустить resync');
    }
  }, [scheduleId, syncStatus]);

  const lockMutation = useMutation({
    mutationFn: () => scheduleService.lock(scheduleId),
    onSuccess: (result) => {
      if (!result.acquired || !result.lock_token) {
        toast.error('Lock не получен');
        return;
      }
      setLockToken(result.lock_token);
      setLockOwner(result.locked_by || 'unknown');
      setLockExpiresAt(result.expires_at || '');
      toast.success('Lock получен');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Не удалось получить lock'),
  });

  const unlockMutation = useMutation({
    mutationFn: () => scheduleService.unlock(scheduleId, lockToken),
    onSuccess: () => {
      setLockToken('');
      setLockOwner('');
      setLockExpiresAt('');
      toast.success('Lock снят');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Не удалось снять lock'),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (crdtEnabled) {
        if (!pending.length) return schedule;
        return opsBatchMutation.mutateAsync();
      }

      let activeLockToken = lockToken;
      if (!activeLockToken) {
        const lock = await scheduleService.lock(scheduleId);
        if (!lock.acquired || !lock.lock_token) {
          throw new Error(lock.locked_by ? `Расписание занято: ${lock.locked_by}` : 'Lock не получен');
        }
        activeLockToken = lock.lock_token;
        setLockToken(lock.lock_token);
        setLockOwner(lock.locked_by || 'unknown');
        setLockExpiresAt(lock.expires_at || '');
      }

      return scheduleService.saveDraft(scheduleId, localSlotsRef.current, activeLockToken);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.schedule(scheduleId) });
      if (zoneId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.schedules(zoneId) });
      }
      toast.success(crdtEnabled ? 'Очередь операций синхронизирована' : 'Черновик сохранён');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Не удалось сохранить'),
  });

  const validateMutation = useMutation({
    mutationFn: async () => {
      if (hasUnsavedChanges || (crdtEnabled && pending.length > 0)) {
        await saveMutation.mutateAsync();
      }
      return scheduleService.validate(scheduleId);
    },
    onSuccess: (result) => {
      setQaIssues(result.issues);
      if (!result.issues.length) {
        toast.success('Проверка пройдена без ошибок');
      }
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Проверка не выполнена'),
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (hasUnsavedChanges || (crdtEnabled && pending.length > 0)) {
        await saveMutation.mutateAsync();
      }

      const validation = await scheduleService.validate(scheduleId);
      setQaIssues(validation.issues);

      if (isPublishBlockedByValidation(validation, validation.issues)) {
        throw new Error('Сначала исправьте ошибки валидации');
      }

      const version = Math.max(1, schedule?.current_version ?? 1);
      const result = await scheduleService.publish(scheduleId, version, []);
      if (!result.validation_passed) {
        throw new Error('Публикация заблокирована валидацией');
      }
      return result;
    },
    onSuccess: async (result) => {
      setReleaseInfo({
        releaseId: result.release_id || 'n/a',
        rolloutStatus: result.rollout_status || 'pending',
      });
      setQaIssues(result.issues ?? []);
      await queryClient.invalidateQueries({ queryKey: queryKeys.releases(`schedule:${scheduleId}`) });
      toast.success('Публикация отправлена');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Публикация не выполнена'),
  });

  const timelineDates = useMemo(() => {
    if (timelineView === 'day') {
      return [selectedDate];
    }
    const weekStart = startOfWeekMonday(selectedDate);
    return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  }, [selectedDate, timelineView]);

  const timelineLayoutsByDate = useMemo(() => {
    const grouped = new Map<string, TimelineLaneLayout>();
    for (const date of timelineDates) {
      const segments: LaneSegment[] = [];
      for (const slot of localSlots) {
        const clamped = clampSlotToDate(slot, date);
        if (!clamped) continue;
        segments.push({
          slot,
          startMinutes: clamped.startMinutes,
          endMinutes: clamped.endMinutes,
          left: clamped.startMinutes * PIXELS_PER_MINUTE,
          width: Math.max(8, (clamped.endMinutes - clamped.startMinutes) * PIXELS_PER_MINUTE),
          clipped: clamped.clipped,
        });
      }
      segments.sort((left, right) => left.startMinutes - right.startMinutes);
      grouped.set(date, assignTimelineLanes(segments));
    }
    return grouped;
  }, [localSlots, timelineDates]);

  const calendarCells = useMemo(() => buildMonthCells(calendarDate), [calendarDate]);
  const monthRows = useMemo(() => {
    const rows: CalendarCell[][] = [];
    for (let index = 0; index < calendarCells.length; index += 7) {
      rows.push(calendarCells.slice(index, index + 7));
    }
    return rows;
  }, [calendarCells]);

  const { calendarWeekLayouts, calendarSlotCountByDate } = useMemo(() => {
    const weekLayouts: CalendarWeekLayout[] = monthRows.map(() => ({ segments: [], laneCount: 0 }));
    const slotCountByDate = new Map<string, number>();
    if (!monthRows.length) {
      return { calendarWeekLayouts: weekLayouts, calendarSlotCountByDate: slotCountByDate };
    }

    const visibleStartDate = monthRows[0]?.[0]?.date;
    const visibleEndDateExclusive = addDays(monthRows[monthRows.length - 1]?.[6]?.date || visibleStartDate, 1);
    const visibleStartMs = dateKeyToUtcMs(visibleStartDate);
    const visibleEndMs = dateKeyToUtcMs(visibleEndDateExclusive);
    if (!Number.isFinite(visibleStartMs) || !Number.isFinite(visibleEndMs)) {
      return { calendarWeekLayouts: weekLayouts, calendarSlotCountByDate: slotCountByDate };
    }

    const visibleSlots = localSlots.filter((slot) => {
      const startMs = Date.parse(slot.start_time);
      const endMs = Date.parse(slot.end_time);
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;
      return endMs > visibleStartMs && startMs < visibleEndMs;
    });

    for (const slot of visibleSlots) {
      const slotStartMs = Date.parse(slot.start_time);
      const slotEndMs = Date.parse(slot.end_time);
      if (!Number.isFinite(slotStartMs) || !Number.isFinite(slotEndMs)) continue;

      const overlapStartMs = Math.max(slotStartMs, visibleStartMs);
      const overlapEndMs = Math.min(slotEndMs, visibleEndMs);
      if (overlapStartMs >= overlapEndMs) continue;

      const cursor = new Date(overlapStartMs);
      cursor.setUTCHours(0, 0, 0, 0);
      while (cursor.getTime() < overlapEndMs) {
        const key = cursor.toISOString().slice(0, 10);
        slotCountByDate.set(key, (slotCountByDate.get(key) ?? 0) + 1);
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    }

    monthRows.forEach((row, rowIndex) => {
      const weekStartMs = dateKeyToUtcMs(row[0].date);
      const weekEndMs = dateKeyToUtcMs(addDays(row[6].date, 1));
      const rawSegments: Array<Omit<CalendarWeekSegment, 'laneIndex'>> = [];

      for (const slot of visibleSlots) {
        const slotStartMs = Date.parse(slot.start_time);
        const slotEndMs = Date.parse(slot.end_time);
        if (!Number.isFinite(slotStartMs) || !Number.isFinite(slotEndMs)) continue;

        const overlapStartMs = Math.max(slotStartMs, weekStartMs);
        const overlapEndMs = Math.min(slotEndMs, weekEndMs);
        if (overlapStartMs >= overlapEndMs) continue;

        const startCol = clamp(Math.floor((overlapStartMs - weekStartMs) / DAY_MS), 0, 6);
        const endCol = clamp(Math.ceil((overlapEndMs - weekStartMs) / DAY_MS), startCol + 1, 7);
        rawSegments.push({
          slot,
          startCol,
          endCol,
          clippedStart: slotStartMs < weekStartMs,
          clippedEnd: slotEndMs > weekEndMs,
        });
      }

      rawSegments.sort((left, right) => left.startCol - right.startCol || right.endCol - left.endCol);
      weekLayouts[rowIndex] = assignCalendarLanes(rawSegments);
    });

    return { calendarWeekLayouts: weekLayouts, calendarSlotCountByDate: slotCountByDate };
  }, [localSlots, monthRows]);

  const monthDate = new Date(`${calendarDate}T00:00:00.000Z`);
  const monthValue = Number.isNaN(monthDate.getTime()) ? 0 : monthDate.getUTCMonth();
  const yearValue = Number.isNaN(monthDate.getTime()) ? new Date().getUTCFullYear() : monthDate.getUTCFullYear();

  const patchSlotForDate = useCallback((slotId: string, date: string, startMinutes: number, endMinutes: number) => {
    setLocalSlots((prev) =>
      prev.map((slot) =>
        slot.slot_id === slotId
          ? {
              ...slot,
              start_time: toIsoAtMinutes(date, startMinutes),
              end_time: toIsoAtMinutes(date, endMinutes),
            }
          : slot,
      ),
    );
  }, []);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const state = pointerStateRef.current;
      if (!state) return;

      const deltaMinutesRaw = ((event.clientX - state.originX) / Math.max(1, state.laneWidth)) * MINUTES_IN_DAY;
      const deltaMinutes = Math.round(deltaMinutesRaw / POINTER_STEP_MINUTES) * POINTER_STEP_MINUTES;

      if (state.mode === 'create') {
        const currentMinutes = clamp(state.startMinutes + deltaMinutes, 0, MINUTES_IN_DAY);
        pointerStateRef.current = { ...state, currentMinutes };
        setTimelineDraftRange({
          date: state.date,
          start: state.startMinutes,
          end: currentMinutes,
        });
        return;
      }

      if (state.mode === 'resize') {
        const nextStart =
          state.edge === 'start'
            ? clamp(state.startMinutes + deltaMinutes, 0, state.endMinutes - MIN_SLOT_MINUTES)
            : state.startMinutes;
        const nextEnd =
          state.edge === 'end'
            ? clamp(state.endMinutes + deltaMinutes, state.startMinutes + MIN_SLOT_MINUTES, MINUTES_IN_DAY)
            : state.endMinutes;
        patchSlotForDate(state.slotId, state.date, nextStart, nextEnd);
        return;
      }

      const duration = state.endMinutes - state.startMinutes;
      const nextStart = clamp(state.startMinutes + deltaMinutes, 0, MINUTES_IN_DAY - duration);
      const nextEnd = nextStart + duration;
      patchSlotForDate(state.slotId, state.date, nextStart, nextEnd);
    };

    const handlePointerUp = () => {
      const state = pointerStateRef.current;
      pointerStateRef.current = null;

      if (!state) {
        setTimelineDraftRange(null);
        setActivePointerSlotId('');
        return;
      }

      if (state.mode === 'create') {
        const range = timelineDraftRange ?? {
          date: state.date,
          start: state.startMinutes,
          end: state.currentMinutes,
        };
        const from = Math.min(range.start, range.end);
        const to = Math.max(range.start, range.end);
        if (to - from >= MIN_SLOT_MINUTES) {
          setSelectedSlotId('');
          setSlotDraft((prev) => ({
            ...emptySlotDraft(prev.zone_id || zoneId, range.date),
            source: prev.source,
            publication_id: prev.source === 'publication' ? prev.publication_id : '',
            asset_id: prev.source === 'asset' ? prev.asset_id : '',
            start_date: range.date,
            end_date: range.date,
            start_time: minutesToTime(from),
            end_time: minutesToTime(to),
          }));
        }
      } else {
        const changedSlot = localSlotsRef.current.find((slot) => slot.slot_id === state.slotId);
        if (changedSlot) {
          void emitCrdtOp(state.mode === 'move' ? 'move_slot' : 'update_slot', changedSlot);
        }
      }

      setTimelineDraftRange(null);
      setActivePointerSlotId('');
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [emitCrdtOp, patchSlotForDate, timelineDraftRange, zoneId]);

  const beginCreate = useCallback((event: ReactPointerEvent<HTMLDivElement>, date: string) => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-slot-block="true"]')) return;
    const lane = event.currentTarget;
    const rect = lane.getBoundingClientRect();
    const relativeX = clamp(event.clientX - rect.left, 0, rect.width);
    const startMinutes = Math.round((relativeX / Math.max(rect.width, 1)) * MINUTES_IN_DAY / POINTER_STEP_MINUTES) * POINTER_STEP_MINUTES;

    pointerStateRef.current = {
      mode: 'create',
      date,
      originX: event.clientX,
      laneWidth: rect.width,
      startMinutes,
      currentMinutes: startMinutes,
    };
    setTimelineDraftRange({ date, start: startMinutes, end: startMinutes });
  }, []);

  const beginResize = useCallback(
    (
      event: ReactPointerEvent<HTMLElement>,
      slotId: string,
      date: string,
      edge: ResizeEdge,
      startMinutes: number,
      endMinutes: number,
    ) => {
      event.preventDefault();
      event.stopPropagation();
      const lane = (event.currentTarget as HTMLElement).closest<HTMLElement>('[data-timeline-lane]');
      if (!lane) return;
      const rect = lane.getBoundingClientRect();

      pointerStateRef.current = {
        mode: 'resize',
        slotId,
        date,
        edge,
        originX: event.clientX,
        laneWidth: rect.width,
        startMinutes,
        endMinutes,
      };
      setActivePointerSlotId(slotId);
    },
    [],
  );

  const beginMove = useCallback(
    (
      event: ReactPointerEvent<HTMLElement>,
      slotId: string,
      date: string,
      startMinutes: number,
      endMinutes: number,
    ) => {
      event.preventDefault();
      const lane = (event.currentTarget as HTMLElement).closest<HTMLElement>('[data-timeline-lane]');
      if (!lane) return;
      const rect = lane.getBoundingClientRect();

      pointerStateRef.current = {
        mode: 'move',
        slotId,
        date,
        originX: event.clientX,
        laneWidth: rect.width,
        startMinutes,
        endMinutes,
      };
      setActivePointerSlotId(slotId);
    },
    [],
  );

  const applyDraft = useCallback(async () => {
    if (!schedule) {
      toast.error('Расписание не загружено');
      return;
    }

    const contentSelected = slotDraft.source === 'publication' ? slotDraft.publication_id : slotDraft.asset_id;
    if (!contentSelected) {
      toast.error('Выберите публикацию или ассет');
      return;
    }

    const startIso = toIsoFromDraft(slotDraft.start_date, slotDraft.start_time);
    const endIso = toIsoFromDraft(slotDraft.end_date, slotDraft.end_time);
    if (new Date(startIso) >= new Date(endIso)) {
      toast.error('Конец должен быть позже старта');
      return;
    }

    const slot: ScheduleSlot = {
      slot_id: slotDraft.slot_id || crypto.randomUUID(),
      publication_id: slotDraft.source === 'publication' ? slotDraft.publication_id : '',
      asset_id: slotDraft.source === 'asset' ? slotDraft.asset_id : '',
      start_time: startIso,
      end_time: endIso,
      priority: Number(slotDraft.priority || 0),
      group_id: slotDraft.group_id || '',
      zone_id: slotDraft.zone_id || schedule.zone_id,
      metadata: selectedSlot?.metadata ?? {},
    };

    if (slotDraft.slot_id) {
      const operationType: ScheduleOp['op_type'] =
        selectedSlot && (selectedSlot.start_time !== slot.start_time || selectedSlot.end_time !== slot.end_time)
          ? 'move_slot'
          : 'update_slot';
      await updateLocalSlot(slot, operationType);
      toast.success('Слот обновлён');
    } else {
      await addLocalSlot(slot);
      toast.success('Слот создан');
    }

    setSelectedSlotId(slot.slot_id);
    setSlotDraft(slotToDraft(slot));
  }, [addLocalSlot, schedule, selectedSlot, slotDraft, updateLocalSlot]);

  const deleteSelectedSlot = useCallback(async () => {
    if (!selectedSlot) return;
    await removeLocalSlot(selectedSlot);
    setSelectedSlotId('');
    setSlotDraft(emptySlotDraft(zoneId, selectedDate));
    toast.success('Слот удалён');
  }, [removeLocalSlot, selectedDate, selectedSlot, zoneId]);

  const startCalendarDrag = useCallback(
    (event: ReactDragEvent<HTMLElement>, slotId: string, mode: CalendarDragMode) => {
      event.stopPropagation();
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', `${slotId}::${mode}`);
      setCalendarDragState({ slotId, mode });
      setSelectedSlotId(slotId);
    },
    [],
  );

  const applyCalendarDrop = useCallback(
    async (slotId: string, mode: CalendarDragMode, targetDate: string) => {
      const slot = localSlotsRef.current.find((item) => item.slot_id === slotId);
      if (!slot) return;

      const currentStartDate = isoToDateKey(slot.start_time);
      let nextStartTime = slot.start_time;
      let nextEndTime = slot.end_time;

      if (mode === 'move') {
        const dayDelta = diffDateKeys(currentStartDate, targetDate);
        if (!dayDelta) return;
        nextStartTime = shiftIsoByDays(slot.start_time, dayDelta);
        nextEndTime = shiftIsoByDays(slot.end_time, dayDelta);
      } else if (mode === 'resize-start') {
        nextStartTime = replaceIsoDatePart(slot.start_time, targetDate);
      } else {
        nextEndTime = replaceIsoDatePart(slot.end_time, targetDate);
      }

      if (nextStartTime === slot.start_time && nextEndTime === slot.end_time) {
        return;
      }

      const startMs = Date.parse(nextStartTime);
      const endMs = Date.parse(nextEndTime);
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs - startMs < MIN_SLOT_MINUTES * 60_000) {
        toast.error('Минимальная длительность слота — 15 минут');
        return;
      }

      const nextSlot: ScheduleSlot = {
        ...slot,
        start_time: new Date(startMs).toISOString(),
        end_time: new Date(endMs).toISOString(),
      };

      setSelectedSlotId(nextSlot.slot_id);
      setSlotDraft(slotToDraft(nextSlot));
      await updateLocalSlot(nextSlot, 'move_slot');
      toast.success('Слот в календаре обновлён');
    },
    [updateLocalSlot],
  );

  const handleCalendarDrop = useCallback(
    (event: ReactDragEvent<HTMLElement>, date: string) => {
      event.preventDefault();
      event.stopPropagation();
      const payload = parseCalendarDragPayload(event.dataTransfer.getData('text/plain')) ?? calendarDragState;
      if (!payload) {
        setCalendarDragState(null);
        return;
      }
      void applyCalendarDrop(payload.slotId, payload.mode, date);
      setCalendarDragState(null);
    },
    [applyCalendarDrop, calendarDragState],
  );

  const isBusy =
    lockMutation.isPending ||
    unlockMutation.isPending ||
    saveMutation.isPending ||
    validateMutation.isPending ||
    publishMutation.isPending;

  const saveButtonDisabled = crdtEnabled
    ? opsBatchMutation.isPending || pending.length === 0
    : saveMutation.isPending || !hasUnsavedChanges;

  return (
    <div className="space-y-4">
      <PageHeader
        description={schedule ? `${schedule.name} · ${zoneName}` : 'Schedule workspace'}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            {!crdtEnabled ? (
              <>
                <Button variant="outline" onClick={() => lockMutation.mutate()} disabled={isBusy || Boolean(lockToken)}>
                  {lockToken ? 'Locked' : 'Lock'}
                </Button>
                <Button variant="outline" onClick={() => saveMutation.mutate()} disabled={saveButtonDisabled}>
                  Save
                </Button>
                <Button variant="ghost" onClick={() => unlockMutation.mutate()} disabled={!lockToken || unlockMutation.isPending}>
                  Unlock
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => opsBatchMutation.mutate()} disabled={saveButtonDisabled}>
                Flush ops ({pending.length})
              </Button>
            )}

            <Button variant="outline" onClick={() => validateMutation.mutate()} disabled={validateMutation.isPending}>
              Validate
            </Button>
            <Button onClick={() => publishMutation.mutate()} disabled={publishMutation.isPending}>
              Publish
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/releases?schedule_id=${scheduleId}&zone_id=${zoneId}`}>Releases</Link>
            </Button>
          </div>
        )}
      />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 py-4">
          <Badge variant="outline">{zoneName}</Badge>
          <StatusBadge tone={schedule ? scheduleTone(schedule.status) : 'neutral'} label={schedule?.status || 'draft'} />
          <Badge variant="outline">Version {schedule?.current_version ?? 1}</Badge>
          {crdtEnabled ? <Badge variant={syncStatus === 'online' ? 'default' : 'secondary'}>Sync: {syncStatus}</Badge> : null}
          {crdtEnabled ? <Badge variant={pending.length ? 'secondary' : 'outline'}>Pending ops: {pending.length}</Badge> : null}
          {!crdtEnabled && lockToken ? <Badge variant="outline">Lock owner: {lockOwner || 'unknown'}</Badge> : null}
          {!crdtEnabled && lockToken && lockExpiresAt ? <Badge variant="outline">TTL: {new Date(lockExpiresAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</Badge> : null}
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={(value) => setWorkspaceState(value as WorkspaceTab, selectedDate)} className="space-y-4">
        <TabsList>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Calendar</CardTitle>
              <CardDescription>Выберите день и перейдите в timeline-редактирование.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={String(monthValue)}
                  onValueChange={(value) => {
                    const next = `${yearValue}-${pad2(Number(value) + 1)}-01`;
                    setWorkspaceState(activeTab, next);
                  }}
                >
                  <SelectTrigger className="w-[190px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTH_OPTIONS.map((month) => (
                      <SelectItem key={month.value} value={String(month.value)}>
                        {month.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Input
                  className="w-[120px]"
                  type="number"
                  min={2000}
                  max={2100}
                  value={yearValue}
                  onChange={(event) => {
                    const nextYear = clamp(Number(event.target.value || yearValue), 2000, 2100);
                    setWorkspaceState(activeTab, `${nextYear}-${pad2(monthValue + 1)}-01`);
                  }}
                />

                <Button variant="outline" size="icon" onClick={() => setWorkspaceState(activeTab, shiftMonth(calendarDate, -1))}>
                  <ChevronLeft className="size-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={() => setWorkspaceState(activeTab, shiftMonth(calendarDate, 1))}>
                  <ChevronRight className="size-4" />
                </Button>

                <div className="ml-auto text-sm text-muted-foreground">{formatMonthYear(calendarDate)}</div>
              </div>

              <div className="grid grid-cols-7 overflow-hidden rounded-xl border bg-card">
                {WEEKDAY_LABELS.map((label) => (
                  <div
                    key={label}
                    className="border-r bg-muted/30 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground last:border-r-0"
                  >
                    {label}
                  </div>
                ))}
              </div>

              <div className="overflow-auto rounded-xl border">
                {calendarQuery.isLoading ? (
                  <div className="grid grid-cols-7">
                    {Array.from({ length: 35 }).map((_, index) => (
                      <div key={index} className="h-28 border-b border-r bg-muted/10 last:border-r-0" />
                    ))}
                  </div>
                ) : (
                  monthRows.map((row, rowIndex) => (
                    <div key={`row-${rowIndex}`} className="relative grid grid-cols-7">
                      {(() => {
                        const weekLayout = calendarWeekLayouts[rowIndex] ?? { segments: [], laneCount: 0 };
                        const lanesHeight = weekLayout.laneCount
                          ? weekLayout.laneCount * CALENDAR_SLOT_HEIGHT + (weekLayout.laneCount - 1) * CALENDAR_SLOT_GAP + 10
                          : 0;
                        const cellMinHeight = CALENDAR_EMPTY_ROW_HEIGHT + lanesHeight;

                        return (
                          <>
                            {row.map((cell, cellIndex) => {
                              const isToday = cell.date === today;
                              const isSelected = cell.date === selectedDate;
                              const hasSlots = (calendarSlotCountByDate.get(cell.date) ?? 0) > 0;

                              return (
                                <button
                                  key={cell.date}
                                  type="button"
                                  className={cn(
                                    'relative flex flex-col border-b border-r px-3 py-2 text-left transition hover:bg-muted/20',
                                    cellIndex === 6 && 'border-r-0',
                                    rowIndex === monthRows.length - 1 && 'border-b-0',
                                    !cell.inCurrentMonth && 'bg-muted/10 text-muted-foreground',
                                    isToday && 'bg-primary/10',
                                    isSelected && 'ring-2 ring-primary ring-inset',
                                  )}
                                  style={{ minHeight: `${cellMinHeight}px` }}
                                  onClick={() => setWorkspaceState('timeline', cell.date)}
                                  onDragOver={(event) => {
                                    if (calendarDragState) {
                                      event.preventDefault();
                                    }
                                  }}
                                  onDrop={(event) => handleCalendarDrop(event, cell.date)}
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="text-base font-semibold">{cell.dayOfMonth}</span>
                                    {isToday ? <span className="text-[10px] font-medium uppercase text-primary">Today</span> : null}
                                  </div>
                                  <div className="mt-auto text-[10px] text-muted-foreground">
                                    {hasSlots ? 'Есть слоты' : ''}
                                  </div>
                                </button>
                              );
                            })}

                            {weekLayout.segments.length ? (
                              <div className="pointer-events-none absolute inset-0 z-10">
                                {weekLayout.segments.map((segment) => {
                                  const isSegmentSelected = selectedSlotId === segment.slot.slot_id;
                                  const left = (segment.startCol / 7) * 100;
                                  const width = ((segment.endCol - segment.startCol) / 7) * 100;
                                  const top =
                                    CALENDAR_DAY_HEADER_HEIGHT +
                                    segment.laneIndex * (CALENDAR_SLOT_HEIGHT + CALENDAR_SLOT_GAP);

                                  return (
                                    <div
                                      key={`calendar-segment-${rowIndex}-${segment.slot.slot_id}-${segment.startCol}-${segment.endCol}`}
                                      className={cn(
                                        'pointer-events-auto absolute flex items-center gap-1 rounded-md border px-1.5 text-[10px] shadow-sm',
                                        'border-primary/45 bg-primary/15 hover:bg-primary/20',
                                        isSegmentSelected && 'ring-2 ring-primary',
                                      )}
                                      style={{
                                        left: `calc(${left}% + 4px)`,
                                        width: `calc(${width}% - 8px)`,
                                        top: `${top}px`,
                                        height: `${CALENDAR_SLOT_HEIGHT}px`,
                                      }}
                                      role="button"
                                      tabIndex={0}
                                      draggable
                                      onClick={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        setSelectedSlotId(segment.slot.slot_id);
                                        setSlotDraft(slotToDraft(segment.slot));
                                      }}
                                      onDragStart={(event) => startCalendarDrag(event, segment.slot.slot_id, 'move')}
                                      onDragEnd={() => setCalendarDragState(null)}
                                    >
                                      {segment.clippedStart ? (
                                        <span className="text-[9px] text-muted-foreground">&larr;</span>
                                      ) : (
                                        <button
                                          type="button"
                                          className="size-2 shrink-0 rounded-full border border-primary bg-background"
                                          draggable
                                          onClick={(event) => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                          }}
                                          onDragStart={(event) => startCalendarDrag(event, segment.slot.slot_id, 'resize-start')}
                                          onDragEnd={() => setCalendarDragState(null)}
                                        />
                                      )}

                                      <span className="min-w-0 truncate font-semibold">{slotLabel(segment.slot)}</span>
                                      <span className="shrink-0 text-[9px] text-muted-foreground">
                                        {isoToTime(segment.slot.start_time)}-{isoToTime(segment.slot.end_time)}
                                      </span>

                                      {segment.clippedEnd ? (
                                        <span className="text-[9px] text-muted-foreground">&rarr;</span>
                                      ) : (
                                        <button
                                          type="button"
                                          className="size-2 shrink-0 rounded-full border border-primary bg-background"
                                          draggable
                                          onClick={(event) => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                          }}
                                          onDragStart={(event) => startCalendarDrag(event, segment.slot.slot_id, 'resize-end')}
                                          onDragEnd={() => setCalendarDragState(null)}
                                        />
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : null}
                          </>
                        );
                      })()}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timeline" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <Card>
              <CardHeader>
                <CardTitle>Timeline</CardTitle>
                <CardDescription>Day/Week редактирование слотов. Drag по пустой линии создаёт новый слот.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex rounded-md border p-1">
                    <Button size="sm" variant={timelineView === 'day' ? 'default' : 'ghost'} onClick={() => setTimelineView('day')}>
                      Day
                    </Button>
                    <Button size="sm" variant={timelineView === 'week' ? 'default' : 'ghost'} onClick={() => setTimelineView('week')}>
                      Week
                    </Button>
                  </div>

                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => setWorkspaceState('timeline', addDays(selectedDate, timelineView === 'day' ? -1 : -7))}
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <Input
                    className="w-[170px]"
                    type="date"
                    value={selectedDate}
                    onChange={(event) => setWorkspaceState('timeline', event.target.value)}
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => setWorkspaceState('timeline', addDays(selectedDate, timelineView === 'day' ? 1 : 7))}
                  >
                    <ChevronRight className="size-4" />
                  </Button>

                  {crdtEnabled ? (
                    <Button variant="outline" onClick={requestResync} disabled={syncStatus !== 'online'}>
                      <RefreshCw className={cn('size-4', resyncStatus === 'requesting' && 'animate-spin')} />
                      Resync
                    </Button>
                  ) : null}

                  <div className="ml-auto text-xs text-muted-foreground">
                    {selectedSlot ? `${slotLabel(selectedSlot)} · ${isoToTime(selectedSlot.start_time)}-${isoToTime(selectedSlot.end_time)}` : 'Слот не выбран'}
                  </div>
                </div>

                <div className="space-y-4">
                  {timelineDates.map((date) => {
                    const layout = timelineLayoutsByDate.get(date) ?? { segments: [], laneCount: 0 };
                    const laneHeight = timelineLaneHeight(layout.laneCount);
                    return (
                      <div key={date} className="space-y-2">
                        <div className="text-sm font-medium">{formatDayLabel(date)}</div>
                        <div className="overflow-x-auto rounded-lg border">
                          <div className="relative" style={{ width: `${TIMELINE_WIDTH}px` }}>
                            <div className="relative h-8 border-b bg-muted/5">
                              {Array.from({ length: 25 }, (_, hour) => {
                                const left = hour * 60 * PIXELS_PER_MINUTE;
                                return (
                                  <div key={`${date}-scale-${hour}`} className="absolute inset-y-0" style={{ left }}>
                                    <div className="h-full border-l border-border/35" />
                                    <span className="absolute left-0 top-1.5 -translate-x-1/2 text-[10px] text-muted-foreground">
                                      {pad2(hour)}:00
                                    </span>
                                  </div>
                                );
                              })}
                            </div>

                            <div
                              data-timeline-lane
                              className="relative bg-muted/10"
                              style={{ height: `${laneHeight}px` }}
                              onPointerDown={(event) => beginCreate(event, date)}
                            >
                              {Array.from({ length: 25 }, (_, hour) => {
                                const left = hour * 60 * PIXELS_PER_MINUTE;
                                return (
                                  <div key={`${date}-lane-${hour}`} className="absolute inset-y-0" style={{ left }}>
                                    <div className="h-full border-l border-border/35" />
                                  </div>
                                );
                              })}

                              {timelineDraftRange && timelineDraftRange.date === date ? (
                                <div
                                  className="pointer-events-none absolute rounded border border-dashed border-primary bg-primary/15"
                                  style={{
                                    top: `${TIMELINE_LANE_PADDING_Y}px`,
                                    height: `${Math.max(26, laneHeight - TIMELINE_LANE_PADDING_Y * 2)}px`,
                                    left: `${Math.min(timelineDraftRange.start, timelineDraftRange.end) * PIXELS_PER_MINUTE}px`,
                                    width: `${Math.max(
                                      8,
                                      Math.abs(timelineDraftRange.end - timelineDraftRange.start) * PIXELS_PER_MINUTE,
                                    )}px`,
                                  }}
                                />
                              ) : null}

                              {layout.segments.map((segment) => {
                                const selected = selectedSlotId === segment.slot.slot_id;
                                return (
                                  <div
                                    key={`${date}-${segment.slot.slot_id}`}
                                    data-slot-block="true"
                                    role="button"
                                    tabIndex={0}
                                    className={cn(
                                      'absolute rounded border px-2 py-1 text-left text-[11px] transition',
                                      'border-primary/45 bg-primary/15 hover:bg-primary/20',
                                      selected && 'ring-2 ring-primary',
                                      activePointerSlotId === segment.slot.slot_id && 'cursor-grabbing',
                                    )}
                                    style={{
                                      left: `${segment.left}px`,
                                      width: `${segment.width}px`,
                                      top: `${TIMELINE_LANE_PADDING_Y + segment.laneIndex * (TIMELINE_SLOT_HEIGHT + TIMELINE_SLOT_GAP)}px`,
                                      height: `${TIMELINE_SLOT_HEIGHT}px`,
                                    }}
                                    onPointerDown={(event) => {
                                      setSelectedSlotId(segment.slot.slot_id);
                                      if (!segment.clipped) {
                                        beginMove(event, segment.slot.slot_id, date, segment.startMinutes, segment.endMinutes);
                                      }
                                    }}
                                    onKeyDown={(event) => {
                                      if (event.key === 'Enter' || event.key === ' ') {
                                        setSelectedSlotId(segment.slot.slot_id);
                                      }
                                    }}
                                  >
                                    {!segment.clipped ? (
                                      <>
                                        <button
                                          type="button"
                                          className="absolute -left-1.5 top-1/2 size-3 -translate-y-1/2 rounded-full border border-primary bg-background"
                                          onPointerDown={(event) =>
                                            beginResize(
                                              event,
                                              segment.slot.slot_id,
                                              date,
                                              'start',
                                              segment.startMinutes,
                                              segment.endMinutes,
                                            )
                                          }
                                        />
                                        <button
                                          type="button"
                                          className="absolute -right-1.5 top-1/2 size-3 -translate-y-1/2 rounded-full border border-primary bg-background"
                                          onPointerDown={(event) =>
                                            beginResize(
                                              event,
                                              segment.slot.slot_id,
                                              date,
                                              'end',
                                              segment.startMinutes,
                                              segment.endMinutes,
                                            )
                                          }
                                        />
                                      </>
                                    ) : null}
                                    <div className="truncate font-semibold">{slotLabel(segment.slot)}</div>
                                    <div className="truncate text-[10px] text-muted-foreground">
                                      {isoToTime(segment.slot.start_time)}-{isoToTime(segment.slot.end_time)} · p{segment.slot.priority}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Slot editor</CardTitle>
                <CardDescription>Выберите слот на timeline или создайте новый через drag.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={slotDraft.source === 'publication' ? 'default' : 'outline'}
                    onClick={() =>
                      setSlotDraft((prev) => ({
                        ...prev,
                        source: 'publication',
                        asset_id: '',
                      }))
                    }
                  >
                    Publication
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={slotDraft.source === 'asset' ? 'default' : 'outline'}
                    onClick={() =>
                      setSlotDraft((prev) => ({
                        ...prev,
                        source: 'asset',
                        publication_id: '',
                      }))
                    }
                  >
                    Asset
                  </Button>
                </div>

                {slotDraft.source === 'publication' ? (
                  <div className="space-y-1">
                    <Label>Publication</Label>
                    <Select
                      value={slotDraft.publication_id || '__none__'}
                      onValueChange={(value) =>
                        setSlotDraft((prev) => ({
                          ...prev,
                          publication_id: value === '__none__' ? '' : value,
                          asset_id: '',
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select publication" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Not selected</SelectItem>
                        {(publicationsQuery.data ?? []).map((publication) => (
                          <SelectItem key={publication.publication_id} value={publication.publication_id}>
                            {publication.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Label>Asset</Label>
                    <Select
                      value={slotDraft.asset_id || '__none__'}
                      onValueChange={(value) =>
                        setSlotDraft((prev) => ({
                          ...prev,
                          asset_id: value === '__none__' ? '' : value,
                          publication_id: '',
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select asset" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Not selected</SelectItem>
                        {(assetsQuery.data ?? []).map((asset) => (
                          <SelectItem key={asset.asset_id} value={asset.asset_id}>
                            {asset.filename}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label>Start date</Label>
                    <Input
                      type="date"
                      value={slotDraft.start_date}
                      onChange={(event) => setSlotDraft((prev) => ({ ...prev, start_date: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Start time</Label>
                    <Input
                      type="time"
                      step={900}
                      value={slotDraft.start_time}
                      onChange={(event) => setSlotDraft((prev) => ({ ...prev, start_time: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>End date</Label>
                    <Input
                      type="date"
                      value={slotDraft.end_date}
                      onChange={(event) => setSlotDraft((prev) => ({ ...prev, end_date: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>End time</Label>
                    <Input
                      type="time"
                      step={900}
                      value={slotDraft.end_time}
                      onChange={(event) => setSlotDraft((prev) => ({ ...prev, end_time: event.target.value }))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label>Priority</Label>
                    <Input
                      type="number"
                      value={slotDraft.priority}
                      onChange={(event) => setSlotDraft((prev) => ({ ...prev, priority: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Group (optional)</Label>
                    <Select
                      value={slotDraft.group_id || '__all__'}
                      onValueChange={(value) =>
                        setSlotDraft((prev) => ({
                          ...prev,
                          group_id: value === '__all__' ? '' : value,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="All groups" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">All groups</SelectItem>
                        {(groupsQuery.data ?? []).map((group) => (
                          <SelectItem key={group.group_id} value={group.group_id}>
                            {group.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <Button onClick={() => void applyDraft()}>{slotDraft.slot_id ? 'Update slot' : 'Create slot'}</Button>
                  <Button variant="outline" onClick={() => setSlotDraft(emptySlotDraft(zoneId, selectedDate))}>
                    Reset form
                  </Button>
                  <Button variant="ghost" onClick={() => void deleteSelectedSlot()} disabled={!selectedSlot}>
                    Delete selected slot
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {qaIssues.length ? (
        <Alert variant={qaIssues.some((issue) => issue.severity === 'error') ? 'destructive' : 'default'}>
          <AlertTitle>Validation summary</AlertTitle>
          <AlertDescription>
            {qaIssues.map((issue) => `${issue.severity.toUpperCase()} ${issue.code}: ${issue.message}`).join(' | ')}
          </AlertDescription>
        </Alert>
      ) : null}

      {releaseInfo ? (
        <Alert>
          <AlertTitle>Last publish</AlertTitle>
          <AlertDescription>
            release_id: {releaseInfo.releaseId} · status: {releaseInfo.rolloutStatus}
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
