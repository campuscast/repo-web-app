'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { z } from 'zod';
import { toast } from 'sonner';
import { useAuthStore } from '@/auth/store';
import { hasRole } from '@/auth/guards';
import { DataTable } from '@/components/common/data-table';
import { EmptyState } from '@/components/common/empty-state';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { useLocale } from '@/hooks/use-locale';
import { scheduleService } from '@/services/schedule-service';
import { zoneService } from '@/services/zone-service';

export function SchedulesOverview() {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const roles = useAuthStore((state) => state.roles);
  const allowedZones = useAuthStore((state) => state.zones);
  const isAdmin = hasRole(roles, 'admin');

  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'locked' | 'published'>('all');
  const [newScheduleName, setNewScheduleName] = useState('');
  const [page, setPage] = useState(1);

  const scheduleSchema = useMemo(
    () =>
      z.object({
        name: z.string().min(2, t('schedules.toast.invalidName')),
      }),
    [t],
  );

  const zonesQuery = useQuery({ queryKey: queryKeys.zones, queryFn: zoneService.listZones });

  const visibleZones = useMemo(() => {
    const zones = zonesQuery.data ?? [];
    return isAdmin ? zones : zones.filter((zone) => allowedZones.includes(zone.zone_id));
  }, [allowedZones, isAdmin, zonesQuery.data]);

  const effectiveZoneId = selectedZoneId || visibleZones[0]?.zone_id || '';

  const schedulesQuery = useQuery({
    queryKey: effectiveZoneId ? queryKeys.schedules(effectiveZoneId) : ['schedules', 'none'],
    queryFn: () => scheduleService.listSchedules(effectiveZoneId),
    enabled: Boolean(effectiveZoneId)
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const parsed = scheduleSchema.safeParse({ name: newScheduleName.trim() });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? t('schedules.toast.invalidName'));
      }

      if (!effectiveZoneId) throw new Error(t('schedules.toast.selectZone'));

      return scheduleService.createSchedule({ zone_id: effectiveZoneId, name: parsed.data.name });
    },
    onSuccess: async () => {
      setNewScheduleName('');
      await queryClient.invalidateQueries({ queryKey: queryKeys.schedules(effectiveZoneId) });
      toast.success(t('schedules.toast.created'));
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t('schedules.toast.createFailed'))
  });

  const filtered = useMemo(() => {
    const rows = schedulesQuery.data ?? [];
    const lowered = search.toLowerCase();

    return rows.filter((item) => {
      const matchSearch = item.name.toLowerCase().includes(lowered) || item.schedule_id.toLowerCase().includes(lowered);
      const matchStatus = statusFilter === 'all' || item.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [schedulesQuery.data, search, statusFilter]);

  const pageSize = 10;
  const total = filtered.length;
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-4">
      <PageHeader
        description={t('schedules.description')}
        actions={
          <div className="flex gap-2">
            <Input
              value={newScheduleName}
              onChange={(event) => setNewScheduleName(event.target.value)}
              placeholder={t('schedules.newName')}
              className="w-52"
            />
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              <Plus className="size-4" />
              {t('common.create')}
            </Button>
          </div>
        }
      />

      <DataTable
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="shrink-0 text-sm text-muted-foreground">{t('schedules.zone')}</span>
              <Select
                value={effectiveZoneId}
                onValueChange={(value) => {
                  setSelectedZoneId(value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[180px]">
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

            <div className="flex items-center gap-1.5">
              <span className="shrink-0 text-sm text-muted-foreground">{t('schedules.status')}</span>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('schedules.allStatuses')}</SelectItem>
                  <SelectItem value="draft">draft</SelectItem>
                  <SelectItem value="locked">locked</SelectItem>
                  <SelectItem value="published">published</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="relative w-[260px]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder={t('schedules.search')}
              />
            </div>
          </div>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">{t('schedules.name')}</TableHead>
              <TableHead>{t('schedules.scheduleId')}</TableHead>
              <TableHead>{t('schedules.status')}</TableHead>
              <TableHead>{t('schedules.version')}</TableHead>
              <TableHead className="text-right">{t('schedules.action')}</TableHead>
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
              : paged.map((schedule) => (
                  <TableRow key={schedule.schedule_id}>
                    <TableCell className="pl-4 font-medium">{schedule.name}</TableCell>
                    <TableCell className="font-mono text-xs">{schedule.schedule_id}</TableCell>
                    <TableCell>
                      <StatusBadge
                        tone={
                          schedule.status === 'published'
                            ? 'success'
                            : schedule.status === 'locked'
                              ? 'warning'
                              : 'neutral'
                        }
                        label={schedule.status}
                      />
                    </TableCell>
                    <TableCell>{schedule.current_version}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/schedules/${schedule.schedule_id}`}>{t('schedules.openEditor')}</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>

        {!schedulesQuery.isLoading && !total ? (
          <div className="p-4">
            <EmptyState
              title={t('schedules.emptyTitle')}
              description={t('schedules.emptyDescription')}
              actionLabel={t('schedules.createSchedule')}
              onAction={() => createMutation.mutate()}
            />
          </div>
        ) : null}
      </DataTable>
    </div>
  );
}
