'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { isPublishBlockedByValidation } from '@/features/schedules/validation-flow';
import { PageHeader } from '@/components/common/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { queryKeys } from '@/lib/query-keys';
import { contentService } from '@/services/content-service';
import { deviceService } from '@/services/device-service';
import { publicationService } from '@/services/publication-service';
import { scheduleService } from '@/services/schedule-service';
import { zoneService } from '@/services/zone-service';
import type { ScheduleSlot, ValidationIssue } from '@/types/api';

type ScheduleDayEditorProps = {
  scheduleId: string;
  date: string;
};

type SlotFormState = {
  slot_id?: string;
  asset_id: string;
  publication_id: string;
  start_time: string;
  end_time: string;
  priority: string;
  group_id: string;
  zone_id: string;
};

const TIMELINE_HEIGHT = 720;
const MINUTES_PER_DAY = 24 * 60;

function toDateTimeLocal(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function fromDateTimeLocal(value: string): string {
  const parsed = new Date(value);
  return parsed.toISOString();
}

function emptySlotForm(date: string, zoneId = ''): SlotFormState {
  return {
    asset_id: '',
    publication_id: '',
    start_time: `${date}T09:00`,
    end_time: `${date}T10:00`,
    priority: '0',
    group_id: '',
    zone_id: zoneId,
  };
}

function slotToForm(slot: ScheduleSlot): SlotFormState {
  return {
    slot_id: slot.slot_id,
    asset_id: slot.asset_id || '',
    publication_id: slot.publication_id || '',
    start_time: toDateTimeLocal(slot.start_time),
    end_time: toDateTimeLocal(slot.end_time),
    priority: String(slot.priority),
    group_id: slot.group_id || '',
    zone_id: slot.zone_id,
  };
}

function normalizeSlot(form: SlotFormState, fallbackZoneId: string): ScheduleSlot {
  return {
    slot_id: form.slot_id || crypto.randomUUID(),
    asset_id: form.asset_id || '',
    publication_id: form.publication_id || '',
    start_time: fromDateTimeLocal(form.start_time),
    end_time: fromDateTimeLocal(form.end_time),
    priority: Number(form.priority || 0),
    group_id: form.group_id || '',
    zone_id: form.zone_id || fallbackZoneId,
    metadata: {},
  };
}

function timelineStyle(slot: ScheduleSlot) {
  const start = new Date(slot.start_time);
  const end = new Date(slot.end_time);
  const startMinutes = start.getUTCHours() * 60 + start.getUTCMinutes();
  const endMinutes = end.getUTCHours() * 60 + end.getUTCMinutes();
  const top = (Math.max(0, startMinutes) / MINUTES_PER_DAY) * TIMELINE_HEIGHT;
  const height = (Math.max(30, endMinutes - startMinutes) / MINUTES_PER_DAY) * TIMELINE_HEIGHT;
  return {
    top,
    height,
  };
}

export function ScheduleDayEditor({ scheduleId, date }: ScheduleDayEditorProps) {
  const queryClient = useQueryClient();

  const [localSlots, setLocalSlots] = useState<ScheduleSlot[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState('');
  const [form, setForm] = useState<SlotFormState>(() => emptySlotForm(date));
  const [lockToken, setLockToken] = useState('');
  const [qaIssues, setQaIssues] = useState<ValidationIssue[]>([]);
  const [targetGroupIds, setTargetGroupIds] = useState<string[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [releaseInfo, setReleaseInfo] = useState<{ release_id: string; rollout_status: string } | null>(null);

  const scheduleQuery = useQuery({
    queryKey: queryKeys.schedule(scheduleId),
    queryFn: () => scheduleService.getSchedule(scheduleId),
  });

  const dayQuery = useQuery({
    queryKey: queryKeys.scheduleDay(scheduleId, date),
    queryFn: () => scheduleService.getDay(scheduleId, date),
  });

  useEffect(() => {
    if (!dayQuery.data) return;
    setLocalSlots(dayQuery.data.slots);
    setForm(emptySlotForm(date, dayQuery.data.zone_id));
    setSelectedSlotId('');
  }, [date, dayQuery.data]);

  const assetsQuery = useQuery({
    queryKey: scheduleQuery.data ? queryKeys.content(scheduleQuery.data.zone_id) : ['content', 'none'],
    queryFn: () => contentService.list(scheduleQuery.data!.zone_id),
    enabled: Boolean(scheduleQuery.data?.zone_id),
  });

  const publicationsQuery = useQuery({
    queryKey: scheduleQuery.data ? ['publications', scheduleQuery.data.zone_id] : ['publications', 'none'],
    queryFn: () => publicationService.list(scheduleQuery.data!.zone_id),
    enabled: Boolean(scheduleQuery.data?.zone_id),
  });

  const groupsQuery = useQuery({
    queryKey: scheduleQuery.data ? queryKeys.zoneGroups(scheduleQuery.data.zone_id) : ['groups', 'none'],
    queryFn: () => zoneService.listGroups(scheduleQuery.data!.zone_id),
    enabled: Boolean(scheduleQuery.data?.zone_id),
  });

  const devicesQuery = useQuery({
    queryKey: scheduleQuery.data ? queryKeys.devices(scheduleQuery.data.zone_id) : ['devices', 'none'],
    queryFn: () => deviceService.listByZone(scheduleQuery.data!.zone_id),
    enabled: Boolean(scheduleQuery.data?.zone_id),
  });

  useEffect(() => {
    if (!devicesQuery.data?.length) return;
    if (!selectedDeviceId || !devicesQuery.data.some((device) => device.device_id === selectedDeviceId)) {
      setSelectedDeviceId(devicesQuery.data[0].device_id);
    }
  }, [devicesQuery.data, selectedDeviceId]);

  const previewQuery = useQuery({
    queryKey: selectedDeviceId ? queryKeys.devicePreview(selectedDeviceId) : ['device', 'preview', 'none'],
    queryFn: () => deviceService.getPreview(selectedDeviceId),
    enabled: Boolean(selectedDeviceId),
    refetchInterval: 30000,
  });

  const selectedSlot = useMemo(
    () => localSlots.find((slot) => slot.slot_id === selectedSlotId) || null,
    [localSlots, selectedSlotId],
  );

  useEffect(() => {
    if (selectedSlot) {
      setForm(slotToForm(selectedSlot));
    }
  }, [selectedSlot]);

  const lockMutation = useMutation({
    mutationFn: () => scheduleService.lock(scheduleId),
    onSuccess: (result) => {
      if (!result.acquired || !result.lock_token) {
        toast.error('Lock not acquired');
        return;
      }
      setLockToken(result.lock_token);
      toast.success('Lock acquired');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to lock schedule'),
  });

  const unlockMutation = useMutation({
    mutationFn: () => scheduleService.unlock(scheduleId, lockToken),
    onSuccess: () => {
      setLockToken('');
      toast.success('Lock released');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to unlock schedule'),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      scheduleService.saveDay(scheduleId, {
        date,
        slots: localSlots,
        lock_token: lockToken || undefined,
      }),
    onSuccess: async (result) => {
      setLocalSlots(result.slots);
      await queryClient.invalidateQueries({ queryKey: queryKeys.scheduleDay(scheduleId, date) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.schedules(result.zone_id) });
      toast.success('Day slots saved');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to save day slots'),
  });

  const validateMutation = useMutation({
    mutationFn: () => scheduleService.validate(scheduleId),
    onSuccess: (result) => {
      setQaIssues(result.issues);
      if (!result.issues.length) toast.success('No validation issues');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Validation failed'),
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      const validation = await scheduleService.validate(scheduleId);
      setQaIssues(validation.issues);
      if (isPublishBlockedByValidation(validation, validation.issues)) {
        throw new Error('Validation failed. Resolve issues before publish.');
      }
      return scheduleService.publish(scheduleId, scheduleQuery.data?.current_version || 1, targetGroupIds);
    },
    onSuccess: (result) => {
      setReleaseInfo({
        release_id: result.release_id,
        rollout_status: result.rollout_status,
      });
      toast.success('Release published');
      void queryClient.invalidateQueries({ queryKey: queryKeys.releases(`schedule:${scheduleId}`) });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Publish failed'),
  });

  const addOrUpdateSlot = () => {
    if ((!form.asset_id && !form.publication_id) || !form.start_time || !form.end_time) {
      toast.error('Choose content and time range');
      return;
    }

    const next = normalizeSlot(form, scheduleQuery.data?.zone_id || '');
    if (new Date(next.start_time) >= new Date(next.end_time)) {
      toast.error('Start time must be before end time');
      return;
    }

    setLocalSlots((prev) => {
      const idx = prev.findIndex((slot) => slot.slot_id === next.slot_id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = next;
        return copy;
      }
      return [...prev, next];
    });
    setSelectedSlotId(next.slot_id);
  };

  const deleteSelectedSlot = () => {
    if (!selectedSlot) return;
    setLocalSlots((prev) => prev.filter((slot) => slot.slot_id !== selectedSlot.slot_id));
    setSelectedSlotId('');
    setForm(emptySlotForm(date, scheduleQuery.data?.zone_id || ''));
  };

  const previewImageSrc = previewQuery.data?.image_base64 || previewQuery.data?.image_url || '';
  const zoneId = scheduleQuery.data?.zone_id || dayQuery.data?.zone_id || '';

  return (
    <div className="space-y-4">
      <PageHeader
        description={scheduleQuery.data
          ? `${scheduleQuery.data.name} • ${date} • zone ${scheduleQuery.data.zone_id}`
          : `Schedule day editor • ${date}`}
        actions={(
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => lockMutation.mutate()} disabled={lockMutation.isPending || Boolean(lockToken)}>
              {lockToken ? 'Locked' : 'Lock'}
            </Button>
            <Button variant="outline" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              Save
            </Button>
            <Button variant="outline" onClick={() => validateMutation.mutate()} disabled={validateMutation.isPending}>
              Validate
            </Button>
            <Button onClick={() => publishMutation.mutate()} disabled={publishMutation.isPending}>
              Publish
            </Button>
            <Button variant="ghost" onClick={() => unlockMutation.mutate()} disabled={!lockToken || unlockMutation.isPending}>
              Unlock
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/releases?schedule_id=${scheduleId}&zone_id=${zoneId}`}>Releases</Link>
            </Button>
          </div>
        )}
      />

      <Card>
        <CardHeader>
          <CardTitle>Day context</CardTitle>
          <CardDescription>Слот — это временной интервал показа контента.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <InfoLine label="Schedule" value={scheduleQuery.data?.name || '—'} />
          <InfoLine label="Zone" value={zoneId || '—'} />
          <InfoLine label="Status" value={scheduleQuery.data?.status || '—'} />
          <InfoLine label="Date" value={date} />
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Slots of the day</CardTitle>
            <CardDescription>Список и быстрый выбор для редактирования.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {dayQuery.isLoading ? <Skeleton className="h-64 w-full" /> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Content</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {localSlots.map((slot) => (
                    <TableRow key={slot.slot_id} className={selectedSlotId === slot.slot_id ? 'bg-muted/20' : ''}>
                      <TableCell className="text-xs">
                        {new Date(slot.start_time).toLocaleTimeString()} - {new Date(slot.end_time).toLocaleTimeString()}
                      </TableCell>
                      <TableCell className="text-xs">{slot.publication_id || slot.asset_id || '—'}</TableCell>
                      <TableCell>{slot.priority}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => setSelectedSlotId(slot.slot_id)}>
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!localSlots.length ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                        No slots for selected day.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Day timeline</CardTitle>
            <CardDescription>Визуальный таймлайн с выбором слота.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative overflow-hidden rounded-md border bg-muted/10" style={{ height: TIMELINE_HEIGHT }}>
              {Array.from({ length: 24 }).map((_, hour) => (
                <div key={hour} className="absolute inset-x-0 border-t border-border/40" style={{ top: `${(hour / 24) * 100}%` }}>
                  <span className="absolute -top-2 left-1 text-[10px] text-muted-foreground">{hour.toString().padStart(2, '0')}:00</span>
                </div>
              ))}
              {localSlots.map((slot) => {
                const block = timelineStyle(slot);
                const tone = selectedSlotId === slot.slot_id
                  ? 'border-primary bg-primary/30'
                  : 'border-emerald-500/60 bg-emerald-500/20';
                return (
                  <button
                    key={slot.slot_id}
                    type="button"
                    className={`absolute left-14 right-2 rounded border px-2 py-1 text-left text-xs ${tone}`}
                    style={{ top: block.top, height: block.height }}
                    onClick={() => setSelectedSlotId(slot.slot_id)}
                  >
                    <div className="truncate font-semibold">{slot.publication_id || slot.asset_id || '—'}</div>
                    <div className="truncate">{new Date(slot.start_time).toLocaleTimeString()} - {new Date(slot.end_time).toLocaleTimeString()}</div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Slot editor + player preview</CardTitle>
            <CardDescription>Редактирование слота и последний кадр с плеера.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>Publication</Label>
              <Select
                value={form.publication_id || '__none__'}
                onValueChange={(value) => setForm((prev) => ({ ...prev, publication_id: value === '__none__' ? '' : value, asset_id: value === '__none__' ? prev.asset_id : '' }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select publication" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {(publicationsQuery.data ?? []).map((publication) => (
                    <SelectItem key={publication.publication_id} value={publication.publication_id}>
                      {publication.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Asset</Label>
              <Select
                value={form.asset_id || '__none__'}
                onValueChange={(value) => setForm((prev) => ({ ...prev, asset_id: value === '__none__' ? '' : value, publication_id: value === '__none__' ? prev.publication_id : '' }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select asset" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {(assetsQuery.data ?? []).map((asset) => (
                    <SelectItem key={asset.asset_id} value={asset.asset_id}>
                      {asset.filename}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Start</Label>
                <Input type="datetime-local" value={form.start_time} onChange={(event) => setForm((prev) => ({ ...prev, start_time: event.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>End</Label>
                <Input type="datetime-local" value={form.end_time} onChange={(event) => setForm((prev) => ({ ...prev, end_time: event.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Priority</Label>
                <Input type="number" value={form.priority} onChange={(event) => setForm((prev) => ({ ...prev, priority: event.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Group ID</Label>
                <Input value={form.group_id} onChange={(event) => setForm((prev) => ({ ...prev, group_id: event.target.value }))} placeholder="optional" />
              </div>
            </div>

            <Button onClick={addOrUpdateSlot} className="w-full">
              {selectedSlot ? 'Update slot' : 'Add slot'}
            </Button>
            <Button variant="ghost" onClick={deleteSelectedSlot} className="w-full" disabled={!selectedSlot}>
              Delete selected slot
            </Button>

            <Separator />

            <div className="space-y-1">
              <Label>Publish target groups</Label>
              <div className="max-h-28 space-y-1 overflow-auto rounded border p-2">
                {(groupsQuery.data ?? []).map((group) => (
                  <label key={group.group_id} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={targetGroupIds.includes(group.group_id)}
                      onChange={(event) => {
                        setTargetGroupIds((prev) => {
                          if (event.target.checked) return [...prev, group.group_id];
                          return prev.filter((id) => id !== group.group_id);
                        });
                      }}
                    />
                    {group.name}
                  </label>
                ))}
                {!groupsQuery.data?.length ? <div className="text-xs text-muted-foreground">No groups</div> : null}
              </div>
            </div>

            <Separator />

            <div className="space-y-1">
              <Label>Device preview source</Label>
              <Select value={selectedDeviceId || '__none__'} onValueChange={(value) => setSelectedDeviceId(value === '__none__' ? '' : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select device" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {(devicesQuery.data ?? []).map((device) => (
                    <SelectItem key={device.device_id} value={device.device_id}>
                      {device.device_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-md border bg-muted/10 p-2">
              {previewQuery.isLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : previewImageSrc ? (
                <img src={previewImageSrc} alt="Player preview" className="h-40 w-full rounded object-cover" />
              ) : (
                <div className="flex h-40 flex-col items-center justify-center text-center text-xs text-muted-foreground">
                  <p>No screenshot uploaded yet.</p>
                  <p>Показывается fallback-контракт last preview.</p>
                </div>
              )}
              <div className="mt-2 text-xs text-muted-foreground">
                Device: {previewQuery.data?.device_name || '—'} • Updated: {previewQuery.data?.updated_at ? new Date(previewQuery.data.updated_at).toLocaleString() : '—'}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

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
          <AlertTitle>Last publish result</AlertTitle>
          <AlertDescription>
            release_id: {releaseInfo.release_id} • status: {releaseInfo.rollout_status}
          </AlertDescription>
        </Alert>
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
