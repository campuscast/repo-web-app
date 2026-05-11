'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { z } from 'zod';
import { toast } from 'sonner';
import { hasRole } from '@/auth/guards';
import { useAuthStore } from '@/auth/store';
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
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { queryKeys } from '@/lib/query-keys';
import { scheduleService } from '@/services/schedule-service';
import { zoneService } from '@/services/zone-service';

const PAGE_SIZE = 12;
const ALL_ZONES_VALUE = '__all_zones__';

const scheduleSchema = z.object({
  name: z.string().min(2, 'Название должно быть не короче 2 символов'),
  zone_id: z.string().min(1, 'Сначала выберите зону'),
});

function scheduleTone(status: 'draft' | 'locked' | 'published'): 'success' | 'warning' | 'neutral' {
  if (status === 'published') return 'success';
  if (status === 'locked') return 'warning';
  return 'neutral';
}

function todayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

export function SchedulesOverview() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const roles = useAuthStore((state) => state.roles);
  const allowedZones = useAuthStore((state) => state.zones);
  const isAdmin = hasRole(roles, 'admin') || hasRole(roles, 'super_admin');

  const [selectedZoneId, setSelectedZoneId] = useState(ALL_ZONES_VALUE);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'locked' | 'published'>('all');
  const [page, setPage] = useState(1);
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', zone_id: '' });

  const zonesQuery = useQuery({ queryKey: queryKeys.zones, queryFn: zoneService.listZones });
  const visibleZones = useMemo(() => {
    const zones = zonesQuery.data ?? [];
    return isAdmin ? zones : zones.filter((zone) => allowedZones.includes(zone.zone_id));
  }, [allowedZones, isAdmin, zonesQuery.data]);

  const activeZoneFilter = useMemo(() => {
    if (selectedZoneId === ALL_ZONES_VALUE) {
      return ALL_ZONES_VALUE;
    }

    return visibleZones.some((zone) => zone.zone_id === selectedZoneId)
      ? selectedZoneId
      : ALL_ZONES_VALUE;
  }, [selectedZoneId, visibleZones]);

  const zoneIdsForList = useMemo(
    () => activeZoneFilter === ALL_ZONES_VALUE
      ? visibleZones.map((zone) => zone.zone_id)
      : [activeZoneFilter],
    [activeZoneFilter, visibleZones],
  );

  const scheduleQueries = useQueries({
    queries: zoneIdsForList.map((zoneId) => ({
      queryKey: queryKeys.schedules(zoneId),
      queryFn: () => scheduleService.listSchedules(zoneId),
      enabled: Boolean(zoneId),
    })),
  });

  const schedulesLoading = zonesQuery.isLoading || scheduleQueries.some((query) => query.isLoading);
  const schedules = scheduleQueries.flatMap((query) => query.data ?? []);

  const createMutation = useMutation({
    mutationFn: async () => {
      const parsed = scheduleSchema.safeParse({
        name: createForm.name.trim(),
        zone_id: createForm.zone_id,
      });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? 'Некорректные данные');
      }
      return scheduleService.createSchedule(parsed.data);
    },
    onSuccess: async (schedule) => {
      setCreateOpen(false);
      setCreateForm({ name: '', zone_id: '' });
      await queryClient.invalidateQueries({ queryKey: queryKeys.schedules(schedule.zone_id) });
      toast.success('Расписание создано');
      router.push(`/schedules/${schedule.schedule_id}?tab=calendar&date=${todayDateKey()}`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Не удалось создать расписание'),
  });

  const filtered = useMemo(() => {
    const lowered = search.trim().toLowerCase();

    return schedules.filter((item) => {
      const zoneName = visibleZones.find((zone) => zone.zone_id === item.zone_id)?.name ?? item.zone_id;
      const matchesSearch =
        !lowered
        || item.name.toLowerCase().includes(lowered)
        || zoneName.toLowerCase().includes(lowered);
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [schedules, search, statusFilter, visibleZones]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const openCreateDialog = () => {
    if (!visibleZones.length) {
      toast.error('Создайте или получите доступ хотя бы к одной зоне');
      return;
    }

    setCreateForm({
      name: '',
      zone_id: activeZoneFilter === ALL_ZONES_VALUE ? '' : activeZoneFilter,
    });
    setCreateOpen(true);
  };

  return (
    <div className="space-y-4">
      <PageHeader description="Schedules: выберите расписание, откройте workspace и управляйте публикацией." />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <Select
            value={activeZoneFilter}
            onValueChange={(value) => {
              setSelectedZoneId(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-8 w-[220px]">
              <SelectValue placeholder="Filter by zone" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_ZONES_VALUE}>All zones</SelectItem>
              {visibleZones.map((zone) => (
                <SelectItem key={zone.zone_id} value={zone.zone_id}>
                  {zone.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={statusFilter}
            onValueChange={(value) => {
              setStatusFilter(value as typeof statusFilter);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-8 w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="draft">draft</SelectItem>
              <SelectItem value="locked">locked</SelectItem>
              <SelectItem value="published">published</SelectItem>
            </SelectContent>
          </Select>

          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 pl-8"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search schedule"
            />
          </div>
        </div>

        <Button className="h-8 self-start sm:self-auto" onClick={openCreateDialog} disabled={!visibleZones.length}>
          <Plus className="size-4" />
          New schedule
        </Button>
      </div>

      <Dialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) {
            setCreateForm({ name: '', zone_id: '' });
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create schedule</DialogTitle>
            <DialogDescription>
              Укажите название нового расписания и выберите зону, к которой оно будет относиться.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="schedule-name">Schedule name</Label>
              <Input
                id="schedule-name"
                value={createForm.name}
                onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Zone</Label>
              <Select
                value={createForm.zone_id}
                onValueChange={(value) => setCreateForm((current) => ({ ...current, zone_id: value }))}
              >
                <SelectTrigger className="w-full">
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
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DataTable
        total={filtered.length}
        page={currentPage}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Название</TableHead>
              <TableHead>Зона</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Версия</TableHead>
              <TableHead className="text-right">Действие</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {schedulesLoading
              ? Array.from({ length: 6 }).map((_, index) => (
                  <TableRow key={index}>
                    <TableCell colSpan={5}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              : paged.map((schedule) => {
                  const zoneName = visibleZones.find((zone) => zone.zone_id === schedule.zone_id)?.name ?? 'Unknown zone';
                  return (
                    <TableRow key={schedule.schedule_id} className="cursor-pointer">
                      <TableCell className="pl-4 font-medium">{schedule.name}</TableCell>
                      <TableCell>{zoneName}</TableCell>
                      <TableCell>
                        <StatusBadge tone={scheduleTone(schedule.status)} label={schedule.status} />
                      </TableCell>
                      <TableCell>{schedule.current_version}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => router.push(`/schedules/${schedule.schedule_id}?tab=calendar&date=${todayDateKey()}`)}
                        >
                          Открыть workspace
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
          </TableBody>
        </Table>

        {!schedulesLoading && !filtered.length ? (
          <div className="p-4">
            <EmptyState
              title="Расписаний пока нет"
              description={
                activeZoneFilter === ALL_ZONES_VALUE
                  ? 'По текущим фильтрам расписания не найдены.'
                  : 'Создайте первое расписание для выбранной зоны.'
              }
              actionLabel="Create schedule"
              onAction={openCreateDialog}
            />
          </div>
        ) : null}
      </DataTable>
    </div>
  );
}
