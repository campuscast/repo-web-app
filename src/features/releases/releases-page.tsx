'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { useAuthStore } from '@/auth/store';
import { hasRole } from '@/auth/guards';
import { DataTable } from '@/components/common/data-table';
import { EmptyState } from '@/components/common/empty-state';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { queryKeys } from '@/lib/query-keys';
import { releaseService } from '@/services/release-service';
import { scheduleService } from '@/services/schedule-service';
import { zoneService } from '@/services/zone-service';

const PAGE_SIZE = 20;

function releaseTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'active') return 'success';
  if (status === 'rolling_out' || status === 'pending') return 'warning';
  if (status === 'failed') return 'danger';
  return 'neutral';
}

function formatPublishedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const formatted = new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
  return formatted.replace(',', '').replaceAll('.', '-');
}

export function ReleasesPage() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const roles = useAuthStore((state) => state.roles);
  const allowedZones = useAuthStore((state) => state.zones);
  const isAdmin = hasRole(roles, 'admin') || hasRole(roles, 'super_admin');

  const [selectedZoneId, setSelectedZoneId] = useState(searchParams.get('zone_id') || '');
  const [selectedScheduleId, setSelectedScheduleId] = useState(searchParams.get('schedule_id') || 'all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [publishedFrom, setPublishedFrom] = useState('');
  const [publishedTo, setPublishedTo] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [deletingReleaseId, setDeletingReleaseId] = useState('');

  const zonesQuery = useQuery({ queryKey: queryKeys.zones, queryFn: zoneService.listZones });

  const visibleZones = useMemo(() => {
    const zones = zonesQuery.data ?? [];
    return isAdmin ? zones : zones.filter((zone) => allowedZones.includes(zone.zone_id));
  }, [allowedZones, isAdmin, zonesQuery.data]);

  const effectiveZoneId = selectedZoneId || visibleZones[0]?.zone_id || '';

  const schedulesQuery = useQuery({
    queryKey: effectiveZoneId ? queryKeys.schedules(effectiveZoneId) : ['schedules', 'none'],
    queryFn: () => scheduleService.listSchedules(effectiveZoneId),
    enabled: Boolean(effectiveZoneId),
  });

  const releasesQuery = useQuery({
    queryKey: queryKeys.releases(
      JSON.stringify({
        zone: effectiveZoneId,
        schedule: selectedScheduleId,
        status: selectedStatus,
        from: publishedFrom,
        to: publishedTo,
        page,
      }),
    ),
    queryFn: () =>
      releaseService.list({
        zone_id: effectiveZoneId || undefined,
        schedule_id: selectedScheduleId !== 'all' ? selectedScheduleId : undefined,
        status: selectedStatus !== 'all' ? selectedStatus : undefined,
        published_from: publishedFrom || undefined,
        published_to: publishedTo || undefined,
        page,
        page_size: PAGE_SIZE,
      }),
    enabled: Boolean(effectiveZoneId),
  });

  const filteredRows = useMemo(() => {
    const rows = releasesQuery.data?.data ?? [];
    const lowered = search.trim().toLowerCase();
    if (!lowered) return rows;
    return rows.filter((row) =>
      row.release_id.toLowerCase().includes(lowered)
      || row.schedule_id.toLowerCase().includes(lowered)
      || row.schedule_name.toLowerCase().includes(lowered),
    );
  }, [releasesQuery.data?.data, search]);

  const deleteReleaseMutation = useMutation({
    mutationFn: (releaseId: string) => releaseService.delete(releaseId),
    onSuccess: async (_, releaseId) => {
      setDeletingReleaseId('');
      await queryClient.invalidateQueries({ queryKey: ['releases'] });
      toast.success(`Release удален: ${releaseId.slice(0, 8)}`);
    },
    onError: (error) => {
      setDeletingReleaseId('');
      toast.error(error instanceof Error ? error.message : 'Не удалось удалить release');
    },
  });

  return (
    <div className="space-y-4">
      <PageHeader description="Операторский список реальных release-сборок расписаний и manifest-состояния." />

      <DataTable
        total={releasesQuery.data?.pagination.total ?? filteredRows.length}
        page={releasesQuery.data?.pagination.page ?? page}
        pageSize={releasesQuery.data?.pagination.page_size ?? PAGE_SIZE}
        onPageChange={setPage}
        toolbar={(
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={effectiveZoneId}
              onValueChange={(value) => {
                setSelectedZoneId(value);
                setSelectedScheduleId('all');
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Zone" />
              </SelectTrigger>
              <SelectContent>
                {visibleZones.map((zone) => (
                  <SelectItem key={zone.zone_id} value={zone.zone_id}>
                    {zone.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={selectedScheduleId}
              onValueChange={(value) => {
                setSelectedScheduleId(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Schedule" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All schedules</SelectItem>
                {(schedulesQuery.data ?? []).map((schedule) => (
                  <SelectItem key={schedule.schedule_id} value={schedule.schedule_id}>
                    {schedule.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={selectedStatus}
              onValueChange={(value) => {
                setSelectedStatus(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[170px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">pending</SelectItem>
                <SelectItem value="rolling_out">rolling_out</SelectItem>
                <SelectItem value="active">active</SelectItem>
                <SelectItem value="failed">failed</SelectItem>
              </SelectContent>
            </Select>

            <Input
              className="w-[150px]"
              type="date"
              value={publishedFrom}
              onChange={(event) => {
                setPublishedFrom(event.target.value);
                setPage(1);
              }}
            />
            <Input
              className="w-[150px]"
              type="date"
              value={publishedTo}
              onChange={(event) => {
                setPublishedTo(event.target.value);
                setPage(1);
              }}
            />

            <div className="relative w-[260px]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search release/schedule"
              />
            </div>
          </div>
        )}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Schedule</TableHead>
              <TableHead>Published</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Target groups</TableHead>
              <TableHead>Manifest</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {releasesQuery.isLoading
              ? Array.from({ length: 8 }).map((_, index) => (
                  <TableRow key={index}>
                    <TableCell colSpan={7}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              : filteredRows.map((release) => (
                  <TableRow key={release.release_id}>
                    <TableCell className="pl-4">
                      <div className="font-medium">{release.schedule_name || release.schedule_id}</div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {formatPublishedAt(release.published_at)}
                    </TableCell>
                    <TableCell>v{release.version_number}</TableCell>
                    <TableCell className="text-xs">
                      {release.target_group_ids.length ? release.target_group_ids.join(', ') : 'all devices in zone'}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        tone={release.manifest_present ? 'success' : 'warning'}
                        label={release.manifest_present ? 'present' : 'missing'}
                      />
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={releaseTone(release.status)} label={release.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-2">
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/releases/${release.release_id}`}>Open release</Link>
                        </Button>
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/schedules/${release.schedule_id}`}>Open schedule</Link>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          disabled={deleteReleaseMutation.isPending && deletingReleaseId === release.release_id}
                          onClick={() => {
                            const confirmed = window.confirm('Удалить release без возможности восстановления?');
                            if (!confirmed) return;
                            setDeletingReleaseId(release.release_id);
                            deleteReleaseMutation.mutate(release.release_id);
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>

        {!releasesQuery.isLoading && filteredRows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="No releases found"
              description="Список строится только по реальным release-записям schedule-service."
            />
          </div>
        ) : null}
      </DataTable>
    </div>
  );
}
