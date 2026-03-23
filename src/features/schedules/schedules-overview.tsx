'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { queryKeys } from '@/lib/query-keys';
import { scheduleService } from '@/services/schedule-service';
import { zoneService } from '@/services/zone-service';

const PAGE_SIZE = 12;

const scheduleSchema = z.object({
  name: z.string().min(2, 'Название должно быть не короче 2 символов'),
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

  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [newScheduleName, setNewScheduleName] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'locked' | 'published'>('all');
  const [page, setPage] = useState(1);

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

  const createMutation = useMutation({
    mutationFn: async () => {
      const parsed = scheduleSchema.safeParse({ name: newScheduleName.trim() });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? 'Некорректное название');
      }
      if (!effectiveZoneId) throw new Error('Сначала выберите зону');
      return scheduleService.createSchedule({ zone_id: effectiveZoneId, name: parsed.data.name });
    },
    onSuccess: async (schedule) => {
      setNewScheduleName('');
      await queryClient.invalidateQueries({ queryKey: queryKeys.schedules(effectiveZoneId) });
      toast.success('Расписание создано');
      router.push(`/schedules/${schedule.schedule_id}?tab=calendar&date=${todayDateKey()}`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Не удалось создать расписание'),
  });

  const filtered = useMemo(() => {
    const rows = schedulesQuery.data ?? [];
    const lowered = search.trim().toLowerCase();

    return rows.filter((item) => {
      const matchesSearch = !lowered || item.name.toLowerCase().includes(lowered);
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [schedulesQuery.data, search, statusFilter]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-4">
      <PageHeader
        description="Schedules: выберите расписание, откройте workspace и управляйте публикацией."
        actions={(
          <div className="flex gap-2">
            <Input
              value={newScheduleName}
              onChange={(event) => setNewScheduleName(event.target.value)}
              placeholder="Новое расписание"
              className="w-56"
            />
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              <Plus className="size-4" />
              Создать
            </Button>
          </div>
        )}
      />

      <DataTable
        total={filtered.length}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        toolbar={(
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={effectiveZoneId}
              onValueChange={(value) => {
                setSelectedZoneId(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Выберите зону" />
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
              value={statusFilter}
              onValueChange={(value) => {
                setStatusFilter(value as typeof statusFilter);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все статусы</SelectItem>
                <SelectItem value="draft">draft</SelectItem>
                <SelectItem value="locked">locked</SelectItem>
                <SelectItem value="published">published</SelectItem>
              </SelectContent>
            </Select>

            <div className="relative w-[280px]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Поиск по названию"
              />
            </div>
          </div>
        )}
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
            {schedulesQuery.isLoading
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

        {!schedulesQuery.isLoading && !filtered.length ? (
          <div className="p-4">
            <EmptyState
              title="Расписаний пока нет"
              description="Создайте первое расписание для выбранной зоны."
              actionLabel="Создать расписание"
              onAction={() => createMutation.mutate()}
            />
          </div>
        ) : null}
      </DataTable>
    </div>
  );
}
