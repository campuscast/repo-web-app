import type { ScheduleSlot } from '@/types/api';

export type CalendarResizeEdge = 'start' | 'end';

export const MIN_SLOT_DURATION_MS = 15 * 60 * 1000;

export function shouldShowTimelineResizeHandles(params: {
  selectedSlotId: string;
  slotId: string;
  hasEditableLock: boolean;
  clipped: boolean;
}): boolean {
  if (!params.hasEditableLock || params.clipped) return false;
  if (!params.selectedSlotId) return false;
  return params.selectedSlotId === params.slotId;
}

export function getCalendarSegmentGeometry(params: {
  startCol: number;
  endCol: number;
  columns?: number;
  insetPx?: number;
}) {
  const columns = Math.max(1, params.columns ?? 7);
  const insetPx = Math.max(0, params.insetPx ?? 4);
  const safeStart = Math.max(0, Math.min(columns - 1, params.startCol));
  const safeEnd = Math.max(safeStart + 1, Math.min(columns, params.endCol));

  return {
    leftPercent: (safeStart / columns) * 100,
    widthPercent: ((safeEnd - safeStart) / columns) * 100,
    insetPx,
  };
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

export function resolveCalendarResizePreview(params: {
  slot: ScheduleSlot;
  edge: CalendarResizeEdge;
  targetDate: string;
  minDurationMs?: number;
}): ScheduleSlot | null {
  const minDurationMs = params.minDurationMs ?? MIN_SLOT_DURATION_MS;

  const startIso =
    params.edge === 'start'
      ? replaceIsoDatePart(params.slot.start_time, params.targetDate)
      : params.slot.start_time;
  const endIso =
    params.edge === 'end'
      ? replaceIsoDatePart(params.slot.end_time, params.targetDate)
      : params.slot.end_time;

  const startMs = Date.parse(startIso);
  const endMs = Date.parse(endIso);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  if (endMs - startMs < minDurationMs) return null;

  return {
    ...params.slot,
    start_time: new Date(startMs).toISOString(),
    end_time: new Date(endMs).toISOString(),
  };
}
