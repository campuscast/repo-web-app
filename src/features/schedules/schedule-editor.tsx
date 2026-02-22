'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatDistanceToNowStrict } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuthStore } from '@/auth/store';
import { hasRole } from '@/auth/guards';
import { getAccessToken } from '@/auth/token-store';
import { useCrdtStore } from '@/features/schedules/crdt-store';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { useCrdtQueue } from '@/hooks/use-crdt-queue';
import { env } from '@/lib/env';
import { queryKeys } from '@/lib/query-keys';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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

function inferSignatureFailure(issues: ValidationIssue[] = []) {
  return issues.some(
    (issue) =>
      issue.code.toLowerCase().includes('sign') || issue.message.toLowerCase().includes('signature')
  );
}

export function ScheduleEditor({ scheduleId }: ScheduleEditorProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [slotForm, setSlotForm] = useState<LocalSlotForm>(EMPTY_SLOT_FORM);
  const [localSlots, setLocalSlots] = useState<ScheduleSlot[]>([]);
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
  const { rejected, transforms, pushOp, setRejected, setTransform, revertLast, clearAll } =
    useCrdtStore();
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
    queryKey: queryKeys.schedules(effectiveZoneId),
    queryFn: () => scheduleService.listSchedules(effectiveZoneId),
    enabled: Boolean(effectiveZoneId)
  });

  const activeSchedule = useMemo(() => {
    const list = schedulesQuery.data ?? [];
    if (scheduleId === 'default') {
      return list[0] ?? null;
    }

    return list.find((item) => item.schedule_id === scheduleId) ?? list[0] ?? null;
  }, [scheduleId, schedulesQuery.data]);

  useEffect(() => {
    if (activeSchedule?.slots?.length) {
      setLocalSlots(activeSchedule.slots);
    }
  }, [activeSchedule]);

  const lockMutation = useMutation({
    mutationFn: () => {
      if (!activeSchedule) throw new Error('Нет выбранного schedule');
      return scheduleService.lock(activeSchedule.schedule_id);
    },
    onSuccess: (result) => {
      if (!result.acquired || !result.lock_token) {
        toast.error('Лок не получен');
        return;
      }
      setLockToken(result.lock_token);
      setLockOwner(result.locked_by || 'unknown');
      setLockExpiresAt(result.expires_at || '');
      toast.success('Лок получен');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Ошибка lock')
  });

  const unlockMutation = useMutation({
    mutationFn: () => {
      if (!activeSchedule || !lockToken) throw new Error('Нет lock token');
      return scheduleService.unlock(activeSchedule.schedule_id, lockToken);
    },
    onSuccess: () => {
      setLockToken('');
      setLockOwner('');
      setLockExpiresAt('');
      toast.success('Лок снят');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Ошибка unlock')
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!activeSchedule || !lockToken) throw new Error('Сначала получите lock');
      return scheduleService.saveDraft(activeSchedule.schedule_id, localSlots, lockToken);
    },
    onSuccess: async () => {
      if (!effectiveZoneId) return;
      await queryClient.invalidateQueries({ queryKey: queryKeys.schedules(effectiveZoneId) });
      toast.success('Draft сохранён');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Ошибка save')
  });

  const validateMutation = useMutation({
    mutationFn: () => {
      if (!activeSchedule) throw new Error('Нет выбранного schedule');
      return scheduleService.validate(activeSchedule.schedule_id);
    },
    onSuccess: (result) => {
      setQaIssues(result.issues);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Ошибка validate')
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!activeSchedule) throw new Error('Нет выбранного schedule');

      const validation = await scheduleService.validate(activeSchedule.schedule_id);
      setQaIssues(validation.issues);

      if (!validation.valid || validation.has_fatal || inferSignatureFailure(validation.issues)) {
        throw new Error('Publish остановлен: QA/signature validation failed');
      }

      const result = await scheduleService.publish(
        activeSchedule.schedule_id,
        activeSchedule.current_version,
        []
      );

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
      toast.success('Publish принят');
    },
    onError: (error) => {
      setReleaseInfo(null);
      toast.error(error instanceof Error ? error.message : 'Publish failed');
    }
  });

  const opsBatchMutation = useMutation({
    mutationFn: async () => {
      if (!activeSchedule) throw new Error('Нет выбранного schedule');
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
        toast.error(`Отклонено операций: ${result.rejected}`);
      }
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Ошибка синхронизации')
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
    if (!crdtEnabled || !isOnline || !pending.length || !activeSchedule) {
      return;
    }

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

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Schedule Editor</CardTitle>
          <CardDescription>
            Режим: <strong>{crdtEnabled ? 'CRDT ON' : 'CRDT OFF (lock/save)'}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Zone</Label>
              <Select value={effectiveZoneId} onChange={(event) => setSelectedZoneId(event.target.value)}>
                {visibleZones.map((zone) => (
                  <option key={zone.zone_id} value={zone.zone_id}>
                    {zone.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Schedule</Label>
              <Select
                value={activeSchedule?.schedule_id ?? ''}
                onChange={(event) => {
                  const next = (schedulesQuery.data ?? []).find(
                    (item) => item.schedule_id === event.target.value
                  );
                  if (next?.slots) {
                    setLocalSlots(next.slots);
                  }
                  router.push(`/schedules/${event.target.value}`);
                }}
              >
                {(schedulesQuery.data ?? []).map((schedule) => (
                  <option key={schedule.schedule_id} value={schedule.schedule_id}>
                    {schedule.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {crdtEnabled ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={isOnline ? 'success' : 'destructive'}>
                Network: {isOnline ? 'online' : 'offline'}
              </Badge>
              <Badge variant={syncStatus === 'online' ? 'success' : 'secondary'}>Sync: {syncStatus}</Badge>
              <Badge variant={pending.length ? 'secondary' : 'success'}>Pending ops: {pending.length}</Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  revertLast();
                  await clearSchedule();
                  clearAll();
                }}
              >
                Revert last
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={lockToken ? 'success' : 'secondary'}>
                Lock: {lockToken ? 'acquired' : 'not acquired'}
              </Badge>
              <Badge variant="secondary">Owner: {lockOwner || '—'}</Badge>
              <Badge variant="secondary">TTL: {lockTtl}</Badge>
            </div>
          )}

          <div className="grid gap-2 rounded-md border p-4 md:grid-cols-5">
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
              <Button
                onClick={async () => {
                  if (!activeSchedule || !slotForm.asset_id || !slotForm.start_time || !slotForm.end_time) {
                    toast.error('Заполните slot форму');
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
                }}
              >
                Добавить slot
              </Button>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Slot ID</TableHead>
                <TableHead>Asset</TableHead>
                <TableHead>Time Range</TableHead>
                <TableHead>Priority</TableHead>
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
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {!crdtEnabled ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => lockMutation.mutate()} disabled={lockMutation.isPending}>
                Lock
              </Button>
              <Button
                variant="outline"
                onClick={() => saveMutation.mutate()}
                disabled={!lockToken || saveMutation.isPending}
              >
                Save
              </Button>
              <Button
                variant="success"
                onClick={() => publishMutation.mutate()}
                disabled={!lockToken || publishMutation.isPending}
              >
                Publish
              </Button>
              <Button
                variant="ghost"
                onClick={() => unlockMutation.mutate()}
                disabled={!lockToken || unlockMutation.isPending}
              >
                Unlock
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => opsBatchMutation.mutate()} disabled={!pending.length}>
                Sync batch now
              </Button>
              <Button variant="outline" onClick={() => validateMutation.mutate()}>
                QA validate
              </Button>
              <Button variant="success" onClick={() => publishMutation.mutate()}>
                Publish
              </Button>
            </div>
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
      ) : null}

      {releaseInfo ? (
        <Alert variant="success">
          <AlertTitle>Release</AlertTitle>
          <AlertDescription>
            release_id: <span className="font-mono">{releaseInfo.releaseId}</span>, rollout status:{' '}
            <strong>{releaseInfo.rolloutStatus}</strong>
          </AlertDescription>
        </Alert>
      ) : null}

      {crdtEnabled && (rejected.length || transforms.length) ? (
        <Card>
          <CardHeader>
            <CardTitle>CRDT Events</CardTitle>
            <CardDescription>Reject + auto-transform причины</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Rejected</h4>
              {rejected.map((row) => (
                <div key={row.operation_id} className="rounded border border-destructive/30 p-2 text-xs">
                  <div className="font-mono">{row.operation_id}</div>
                  <div>{row.reason}</div>
                  {row.explanation ? <div className="text-muted-foreground">{row.explanation}</div> : null}
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Auto-transform</h4>
              {transforms.map((row) => (
                <div key={`${row.operation_id}-${row.reason}`} className="rounded border p-2 text-xs">
                  <div className="font-mono">{row.operation_id}</div>
                  <div>{row.reason}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
