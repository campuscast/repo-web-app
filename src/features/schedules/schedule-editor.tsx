'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatDistanceToNowStrict } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { toast } from 'sonner';
import { useAuthStore } from '@/auth/store';
import { hasRole } from '@/auth/guards';
import { getAccessToken } from '@/auth/token-store';
import { useCrdtStore } from '@/features/schedules/crdt-store';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { useCrdtQueue } from '@/hooks/use-crdt-queue';
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
import type { ScheduleOp, ScheduleSlot, ValidationIssue } from '@/types/api';

type ScheduleEditorProps = {
  scheduleId: string;
};

type LocalSlotForm = {
  asset_id: string;
  start_time: string;
  end_time: string;
  priority: string;
  group_id: string;
};

const EMPTY_SLOT_FORM: LocalSlotForm = {
  asset_id: '',
  start_time: '',
  end_time: '',
  priority: '0',
  group_id: ''
};

const createScheduleSchema = z.object({
  name: z.string().min(2, 'Название расписания обязательно')
});

function inferSignatureFailure(issues: ValidationIssue[] = []) {
  return issues.some(
    (issue) => issue.code.toLowerCase().includes('sign') || issue.message.toLowerCase().includes('signature')
  );
}

export function ScheduleEditor({ scheduleId }: ScheduleEditorProps) {
  const queryClient = useQueryClient();
  const router = useRouter();

  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [slotForm, setSlotForm] = useState<LocalSlotForm>(EMPTY_SLOT_FORM);
  const [localSlots, setLocalSlots] = useState<ScheduleSlot[]>([]);
  const [newScheduleName, setNewScheduleName] = useState('');
  const [lockToken, setLockToken] = useState('');
  const [lockOwner, setLockOwner] = useState('');
  const [lockExpiresAt, setLockExpiresAt] = useState<string>('');
  const [qaIssues, setQaIssues] = useState<ValidationIssue[]>([]);
  const [releaseInfo, setReleaseInfo] = useState<{ releaseId: string; rolloutStatus: string } | null>(null);

  const roles = useAuthStore((state) => state.roles);
  const allowedZones = useAuthStore((state) => state.zones);
  const crdtEnabled = useAuthStore((state) => state.crdtEnabled);

  const isAdmin = hasRole(roles, 'admin');
  const lamportRef = useRef(0);

  const { isOnline } = useNetworkStatus();
  const { rejected, transforms, pushOp, setRejected, setTransform, revertLast, clearAll } = useCrdtStore();
  const { pending, enqueue, dequeueMany, clearSchedule } = useCrdtQueue(scheduleId);

  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const wsRef = useRef<WsSyncClient | null>(null);

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
      return;
    }

    setLocalSlots([]);
  }, [activeSchedule]);

  const createScheduleMutation = useMutation({
    mutationFn: async () => {
      const parsed = createScheduleSchema.safeParse({ name: newScheduleName.trim() });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? 'Invalid schedule name');
      }

      if (!effectiveZoneId) {
        throw new Error('Select zone first');
      }

      return scheduleService.createSchedule({ zone_id: effectiveZoneId, name: parsed.data.name });
    },
    onSuccess: async (schedule) => {
      setNewScheduleName('');
      await queryClient.invalidateQueries({ queryKey: queryKeys.schedules(effectiveZoneId) });
      toast.success('Schedule created');
      router.push(`/schedules/${schedule.schedule_id}`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to create schedule')
  });

  const lockMutation = useMutation({
    mutationFn: () => {
      if (!activeSchedule) throw new Error('Select schedule first');
      return scheduleService.lock(activeSchedule.schedule_id);
    },
    onSuccess: (result) => {
      if (!result.acquired || !result.lock_token) {
        toast.error('Lock not acquired');
        return;
      }

      setLockToken(result.lock_token);
      setLockOwner(result.locked_by || 'unknown');
      setLockExpiresAt(result.expires_at || '');
      toast.success('Lock acquired');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Lock failed')
  });

  const unlockMutation = useMutation({
    mutationFn: () => {
      if (!activeSchedule || !lockToken) throw new Error('No lock token');
      return scheduleService.unlock(activeSchedule.schedule_id, lockToken);
    },
    onSuccess: () => {
      setLockToken('');
      setLockOwner('');
      setLockExpiresAt('');
      toast.success('Lock released');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unlock failed')
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!activeSchedule || !lockToken) throw new Error('Acquire lock before save');
      return scheduleService.saveDraft(activeSchedule.schedule_id, localSlots, lockToken);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.schedules(effectiveZoneId) });
      toast.success('Draft saved');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Save failed')
  });

  const validateMutation = useMutation({
    mutationFn: () => {
      if (!activeSchedule) throw new Error('No schedule selected');
      return scheduleService.validate(activeSchedule.schedule_id);
    },
    onSuccess: (result) => {
      setQaIssues(result.issues);
      if (!result.issues.length) {
        toast.success('No QA issues found');
      }
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Validation failed')
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!activeSchedule) throw new Error('No schedule selected');

      const validation = await scheduleService.validate(activeSchedule.schedule_id);
      setQaIssues(validation.issues);

      if (!validation.valid || validation.has_fatal || inferSignatureFailure(validation.issues)) {
        throw new Error('Publish aborted: QA/signature checks failed');
      }

      const result = await scheduleService.publish(activeSchedule.schedule_id, activeSchedule.current_version, []);
      if (!result.validation_passed || inferSignatureFailure(result.issues)) {
        throw new Error('Publish rejected by signature/QA checks');
      }

      return result;
    },
    onSuccess: (result) => {
      setReleaseInfo({
        releaseId: result.release_id || 'n/a',
        rolloutStatus: result.rollout_status || 'pending'
      });
      setQaIssues(result.issues ?? []);
      toast.success('Release accepted');
    },
    onError: (error) => {
      setReleaseInfo(null);
      toast.error(error instanceof Error ? error.message : 'Publish failed');
    }
  });

  const opsBatchMutation = useMutation({
    mutationFn: async () => {
      if (!activeSchedule) throw new Error('No schedule selected');
      if (!pending.length) return null;
      const opsToSend = pending.map((item) => item.op);
      return scheduleService.ingestOps(activeSchedule.schedule_id, opsToSend);
    },
    onSuccess: async (result) => {
      if (!result) return;
      const rows = result.results ?? [];
      const ackedIds = rows.filter((row) => row.accepted).map((row) => row.operation_id);
      const rejectedRows = rows.filter((row) => !row.accepted);

      await dequeueMany(ackedIds);

      for (const row of rejectedRows) {
        setRejected({
          operation_id: row.operation_id,
          reason: row.reason ?? 'unknown',
          explanation: row.explanation
        });
      }

      if (result.rejected > 0) {
        toast.error(`Rejected operations: ${result.rejected}`);
      }
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Sync batch failed')
  });

  const upsertLocalSlot = useCallback(
    async (slot: ScheduleSlot, source: 'lock' | 'crdt') => {
      setLocalSlots((prev) => {
        const existingIndex = prev.findIndex((item) => item.slot_id === slot.slot_id);
        if (existingIndex >= 0) {
          const next = [...prev];
          next[existingIndex] = slot;
          return next;
        }

        return [...prev, slot];
      });

      if (source === 'crdt') {
        const op: ScheduleOp = {
          op_type: 'update_slot',
          causal: {
            operation_id: crypto.randomUUID(),
            client_id: 'web-ui',
            lamport_ts: ++lamportRef.current
          },
          slot
        };

        pushOp(op);
        await enqueue(op);
      }
    },
    [enqueue, pushOp]
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
          await dequeueMany(payload.operation_ids);
        },
        onSyncReject: (payload) => {
          setRejected({
            operation_id: payload.operation_id,
            reason: payload.reason,
            explanation: payload.explanation
          });
        },
        onTransform: (payload) => {
          setTransform({ operation_id: payload.operation_id, reason: payload.reason });
        }
      }
    });

    client.connect();
    wsRef.current = client;

    return () => {
      client.disconnect();
      wsRef.current = null;
    };
  }, [crdtEnabled, dequeueMany, isOnline, setRejected, setTransform]);

  useEffect(() => {
    if (!crdtEnabled || !isOnline || !pending.length || !activeSchedule) return;

    if (wsRef.current && syncStatus === 'online') {
      try {
        wsRef.current.sendOps(activeSchedule.schedule_id, pending.map((item) => item.op));
      } catch {
        void opsBatchMutation.mutateAsync();
      }
      return;
    }

    void opsBatchMutation.mutateAsync();
  }, [activeSchedule, crdtEnabled, isOnline, opsBatchMutation, pending, syncStatus]);

  const lockTtl = lockExpiresAt
    ? formatDistanceToNowStrict(new Date(lockExpiresAt), { addSuffix: true, locale: ru })
    : '—';

  const addSlot = async () => {
    if (!activeSchedule || !slotForm.asset_id || !slotForm.start_time || !slotForm.end_time) {
      toast.error('Fill all slot fields');
      return;
    }

    const slot: ScheduleSlot = {
      slot_id: crypto.randomUUID(),
      asset_id: slotForm.asset_id,
      start_time: new Date(slotForm.start_time).toISOString(),
      end_time: new Date(slotForm.end_time).toISOString(),
      priority: Number(slotForm.priority),
      zone_id: activeSchedule.zone_id,
      group_id: slotForm.group_id
    };

    await upsertLocalSlot(slot, crdtEnabled ? 'crdt' : 'lock');
    setSlotForm(EMPTY_SLOT_FORM);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        description={activeSchedule ? `${activeSchedule.name} — CRDT/lock editor` : 'Редактор расписания в lock/save или CRDT sync режиме'}
        actions={
          <div className="flex flex-wrap gap-2">
            {crdtEnabled ? (
              <>
                <Button variant="outline" disabled={!pending.length} onClick={() => opsBatchMutation.mutate()}>
                  Sync batch
                </Button>
                <Button variant="outline" onClick={() => validateMutation.mutate()}>
                  QA validate
                </Button>
                <Button onClick={() => publishMutation.mutate()}>
                  Publish
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => lockMutation.mutate()} disabled={lockMutation.isPending}>
                  Lock
                </Button>
                <Button variant="outline" onClick={() => saveMutation.mutate()} disabled={!lockToken || saveMutation.isPending}>
                  Save draft
                </Button>
                <Button onClick={() => publishMutation.mutate()} disabled={!lockToken || publishMutation.isPending}>
                  Publish
                </Button>
                <Button variant="ghost" onClick={() => unlockMutation.mutate()} disabled={!lockToken || unlockMutation.isPending}>
                  Unlock
                </Button>
              </>
            )}
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Context</CardTitle>
          <CardDescription>Выберите зону и целевое расписание для редактирования</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Zone</Label>
            <Select value={effectiveZoneId} onValueChange={setSelectedZoneId}>
              <SelectTrigger>
                <SelectValue placeholder="Select zone" />
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
            <Label>Schedule</Label>
            <Select
              value={activeSchedule?.schedule_id ?? ''}
              onValueChange={(value) => {
                const next = (schedulesQuery.data ?? []).find((item) => item.schedule_id === value);
                if (next?.slots) {
                  setLocalSlots(next.slots);
                }
                router.push(`/schedules/${value}`);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select schedule" />
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
            <Label>New schedule</Label>
            <div className="flex gap-2">
              <Input value={newScheduleName} onChange={(event) => setNewScheduleName(event.target.value)} placeholder="Morning loop" />
              <Button onClick={() => createScheduleMutation.mutate()} disabled={createScheduleMutation.isPending}>
                Create
              </Button>
            </div>
          </div>

          <div className="md:col-span-3">
            {schedulesQuery.isLoading ? (
              <Skeleton className="h-8 w-full" />
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">Mode: {crdtEnabled ? 'CRDT ON' : 'CRDT OFF'}</Badge>
                <Badge variant={isOnline ? 'default' : 'destructive'}>Network: {isOnline ? 'online' : 'offline'}</Badge>
                <Badge variant={syncStatus === 'online' ? 'default' : 'secondary'}>Sync: {syncStatus}</Badge>
                <Badge variant={pending.length ? 'secondary' : 'default'}>Pending ops: {pending.length}</Badge>
                {!crdtEnabled ? <Badge variant={lockToken ? 'default' : 'secondary'}>Lock: {lockToken ? 'acquired' : 'not acquired'}</Badge> : null}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {!activeSchedule && !schedulesQuery.isLoading ? (
        <EmptyState
          title="No schedules in this zone"
          description="Создайте первое расписание для выбранной зоны и продолжите редактирование."
        />
      ) : null}

      {activeSchedule ? (
        <Tabs defaultValue="timeline" className="space-y-4">
          <TabsList>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="inspector">Inspector</TabsTrigger>
            <TabsTrigger value="sync">Sync events</TabsTrigger>
          </TabsList>

          <TabsContent value="timeline" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Add slot</CardTitle>
                <CardDescription>Новая запись попадает в локальную таблицу и в CRDT queue (если режим CRDT ON)</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-5">
                <Input
                  placeholder="asset_id"
                  value={slotForm.asset_id}
                  onChange={(event) => setSlotForm((prev) => ({ ...prev, asset_id: event.target.value }))}
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

                <div className="md:col-span-5">
                  <Button onClick={addSlot}>Add slot</Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Slots table</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Slot ID</TableHead>
                      <TableHead>Asset</TableHead>
                      <TableHead>Time range</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead className="w-[72px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {localSlots.map((slot) => (
                      <TableRow key={slot.slot_id}>
                        <TableCell className="font-mono text-xs">{slot.slot_id}</TableCell>
                        <TableCell>{slot.asset_id}</TableCell>
                        <TableCell className="text-xs">
                          {new Date(slot.start_time).toLocaleString()} - {new Date(slot.end_time).toLocaleString()}
                        </TableCell>
                        <TableCell>{slot.priority}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setLocalSlots((prev) => prev.filter((item) => item.slot_id !== slot.slot_id))}
                          >
                            Remove
                          </Button>
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
                <CardTitle>Lock and release metadata</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid gap-3 sm:grid-cols-3">
                  <InfoLine label="Lock owner" value={lockOwner || '—'} />
                  <InfoLine label="Lock TTL" value={lockTtl} />
                  <InfoLine label="Schedule version" value={String(activeSchedule.current_version)} />
                </div>
                <Separator />
                {releaseInfo ? (
                  <Alert variant="default">
                    <AlertTitle>Last release</AlertTitle>
                    <AlertDescription>
                      release_id: <span className="font-mono">{releaseInfo.releaseId}</span>, rollout status:{' '}
                      <strong>{releaseInfo.rolloutStatus}</strong>
                    </AlertDescription>
                  </Alert>
                ) : (
                  <p className="text-sm text-muted-foreground">No release info yet.</p>
                )}
              </CardContent>
            </Card>

            {qaIssues.length ? (
              <Alert variant={qaIssues.some((issue) => issue.severity === 'error') ? 'destructive' : 'default'}>
                <AlertTitle>QA issues</AlertTitle>
                <AlertDescription>
                  {qaIssues.map((issue) => `${issue.severity.toUpperCase()} ${issue.code}: ${issue.message}`).join(' | ')}
                </AlertDescription>
              </Alert>
            ) : (
              <Alert>
                <AlertTitle>QA result</AlertTitle>
                <AlertDescription>No issues in current session.</AlertDescription>
              </Alert>
            )}
          </TabsContent>

          <TabsContent value="sync" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>CRDT event stream</CardTitle>
                <CardDescription>Причины reject и auto-transform для входящих операций</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Rejected</h4>
                  {rejected.length ? (
                    rejected.map((row) => (
                      <div key={row.operation_id} className="rounded border border-destructive/30 p-2 text-xs">
                        <div className="font-mono">{row.operation_id}</div>
                        <StatusBadge tone="danger" label={row.reason} />
                        {row.explanation ? <div className="mt-1 text-muted-foreground">{row.explanation}</div> : null}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No rejected ops.</p>
                  )}
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Auto-transform</h4>
                  {transforms.length ? (
                    transforms.map((row) => (
                      <div key={`${row.operation_id}-${row.reason}`} className="rounded border p-2 text-xs">
                        <div className="font-mono">{row.operation_id}</div>
                        <StatusBadge tone="warning" label={row.reason} />
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No transforms.</p>
                  )}
                </div>

                {crdtEnabled ? (
                  <div className="md:col-span-2">
                    <Button
                      variant="outline"
                      onClick={async () => {
                        revertLast();
                        await clearSchedule();
                        clearAll();
                      }}
                    >
                      Revert local pending ops
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
