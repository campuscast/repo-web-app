'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/auth/store';
import { hasRole } from '@/auth/guards';
import { DataTable } from '@/components/common/data-table';
import { EmptyState } from '@/components/common/empty-state';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { queryKeys } from '@/lib/query-keys';
import { scheduleService } from '@/services/schedule-service';
import { zoneService } from '@/services/zone-service';

function inferRolloutFromSchedule(status: 'draft' | 'locked' | 'published') {
  if (status === 'published') return { label: 'active', tone: 'success' as const };
  if (status === 'locked') return { label: 'pending', tone: 'warning' as const };
  return { label: 'not released', tone: 'neutral' as const };
}

export function ReleasesPage() {
  const queryClient = useQueryClient();
  const roles = useAuthStore((state) => state.roles);
  const allowedZones = useAuthStore((state) => state.zones);
  const isAdmin = hasRole(roles, 'admin');

  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [releaseScheduleId, setReleaseScheduleId] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [isCreateOpen, setCreateOpen] = useState(false);

  const zonesQuery = useQuery({ queryKey: queryKeys.zones, queryFn: zoneService.listZones });

  const visibleZones = useMemo(() => {
    const zones = zonesQuery.data ?? [];
    return isAdmin ? zones : zones.filter((zone) => allowedZones.includes(zone.zone_id));
  }, [allowedZones, isAdmin, zonesQuery.data]);

  const effectiveZoneId = selectedZoneId || visibleZones[0]?.zone_id || '';

  const schedulesQuery = useQuery({
    queryKey: effectiveZoneId ? queryKeys.schedules(effectiveZoneId) : ['releases', 'none'],
    queryFn: () => scheduleService.listSchedules(effectiveZoneId),
    enabled: Boolean(effectiveZoneId)
  });

  const filtered = useMemo(() => {
    const rows = schedulesQuery.data ?? [];
    const lowered = search.toLowerCase();
    return rows.filter(
      (row) => row.name.toLowerCase().includes(lowered) || row.schedule_id.toLowerCase().includes(lowered)
    );
  }, [schedulesQuery.data, search]);

  const releaseMutation = useMutation({
    mutationFn: async () => {
      const target = (schedulesQuery.data ?? []).find((row) => row.schedule_id === releaseScheduleId);
      if (!target) throw new Error('Select schedule to release');
      return scheduleService.publish(target.schedule_id, target.current_version, []);
    },
    onSuccess: async () => {
      setCreateOpen(false);
      setReleaseScheduleId('');
      await queryClient.invalidateQueries({ queryKey: queryKeys.schedules(effectiveZoneId) });
      toast.success('Release started');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Release failed')
  });

  const pageSize = 10;
  const total = filtered.length;
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-4">
      <PageHeader
        description="Публикации расписаний и статус rollout по зонам"
        actions={
          <Dialog open={isCreateOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button disabled={!effectiveZoneId}>
                <Plus className="size-4" />
                Create release
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create release</DialogTitle>
                <DialogDescription>Выберите schedule и запустите публикацию его текущей версии.</DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Zone</Label>
                  <Input value={effectiveZoneId || 'N/A'} readOnly />
                </div>
                <div className="space-y-2">
                  <Label>Schedule</Label>
                  <Select value={releaseScheduleId} onValueChange={setReleaseScheduleId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select schedule" />
                    </SelectTrigger>
                    <SelectContent>
                      {(schedulesQuery.data ?? []).map((row) => (
                        <SelectItem key={row.schedule_id} value={row.schedule_id}>
                          {row.name} (v{row.current_version})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter>
                <Button onClick={() => releaseMutation.mutate()} disabled={releaseMutation.isPending || !releaseScheduleId}>
                  {releaseMutation.isPending ? 'Starting...' : 'Publish now'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <DataTable
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={effectiveZoneId}
              onValueChange={(value) => {
                setSelectedZoneId(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[180px]">
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

            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search schedule"
              />
            </div>
          </div>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Schedule</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Schedule status</TableHead>
              <TableHead>Rollout status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {schedulesQuery.isLoading
              ? Array.from({ length: 6 }).map((_, index) => (
                  <TableRow key={index}>
                    <TableCell colSpan={5}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              : paged.map((row) => {
                  const rollout = inferRolloutFromSchedule(row.status);
                  return (
                    <TableRow key={row.schedule_id}>
                      <TableCell>
                        <div className="font-medium">{row.name}</div>
                        <div className="font-mono text-xs text-muted-foreground">{row.schedule_id}</div>
                      </TableCell>
                      <TableCell>{row.current_version}</TableCell>
                      <TableCell>
                        <StatusBadge
                          tone={row.status === 'published' ? 'success' : row.status === 'locked' ? 'warning' : 'neutral'}
                          label={row.status}
                        />
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={rollout.tone} label={rollout.label} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/schedules/${row.schedule_id}`}>Open</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
          </TableBody>
        </Table>

        {!schedulesQuery.isLoading && !total ? (
          <div className="p-4">
            <EmptyState
              title="No release candidates"
              description="Создайте и опубликуйте расписание, чтобы оно появилось в release-list."
            />
          </div>
        ) : null}
      </DataTable>

      <p className="text-xs text-muted-foreground">
        TODO: backend contract for dedicated `/releases` endpoint is not available yet; rollout status is inferred from schedule status.
      </p>
    </div>
  );
}
