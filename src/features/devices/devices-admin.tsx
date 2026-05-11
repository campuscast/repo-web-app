'use client';

import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Film, Info, MoreHorizontal, Plus, Search, Settings, Tags, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/auth/store';
import { hasRole } from '@/auth/guards';
import { DataTable } from '@/components/common/data-table';
import { EmptyState } from '@/components/common/empty-state';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
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
import { formatPlayerId } from '@/lib/player-id';
import { queryKeys } from '@/lib/query-keys';
import { deviceService } from '@/services/device-service';
import { zoneService } from '@/services/zone-service';
import { RegisterDeviceWizard } from './register-device-wizard';

/* ─── Constants ────────────────────────────────────────────────── */

const DEVICE_TYPE_LABELS: Record<string, string> = {
  android_tv: 'Android TV',
  desktop: 'Desktop',
  web: 'Web Player'
};

const ALL_ZONES_VALUE = '__all_zones__';

function formatDeviceType(type: string | null | undefined): string {
  if (!type) return '—';
  return DEVICE_TYPE_LABELS[type] ?? type;
}

function ConnectivityBadge({ online }: { online: boolean }) {
  return (
    <span
      className={`inline-block size-2 rounded-full ${online ? 'bg-emerald-500' : 'bg-slate-400'}`}
      title={online ? 'Online' : 'Offline'}
      aria-label={online ? 'Online' : 'Offline'}
    />
  );
}

/* ─── URL sync helper ──────────────────────────────────────────── */

function syncUrlParams(zone: string, status: string, q: string) {
  const params = new URLSearchParams();
  if (zone && zone !== ALL_ZONES_VALUE) params.set('zone', zone);
  if (status && status !== 'all') params.set('status', status);
  if (q) params.set('q', q);
  const qs = params.toString();
  window.history.replaceState(null, '', qs ? `/devices?${qs}` : '/devices');
}

/* ─── Main Component ───────────────────────────────────────────── */

export function DevicesAdmin() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const roles = useAuthStore((state) => state.roles);
  const allowedZones = useAuthStore((state) => state.zones);
  const isAdmin = hasRole(roles, 'admin');

  // Restore filter state from URL on mount
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'pending' | 'offline' | 'revoked'>(
    (searchParams.get('status') as 'all' | 'active' | 'pending' | 'offline' | 'revoked') || 'all'
  );
  const [page, setPage] = useState(1);
  const [selectedZoneId, setSelectedZoneId] = useState(searchParams.get('zone') || ALL_ZONES_VALUE);
  const [isWizardOpen, setWizardOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; zoneId: string } | null>(null);

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
    [activeZoneFilter, visibleZones]
  );

  const deviceQueries = useQueries({
    queries: zoneIdsForList.map((zoneId) => ({
      queryKey: queryKeys.devices(zoneId),
      queryFn: () => deviceService.listByZone(zoneId),
      enabled: Boolean(zoneId),
      refetchInterval: 5000,
      refetchIntervalInBackground: true,
    }))
  });

  const devicesLoading = zonesQuery.isLoading || deviceQueries.some((query) => query.isLoading);
  const devices = deviceQueries.flatMap((query) => query.data ?? []);

  const deleteMutation = useMutation({
    mutationFn: ({ deviceId }: { deviceId: string; zoneId: string }) => deviceService.deleteDevice(deviceId),
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.devices(variables.zoneId) });
      toast.success('Player deleted');
      setDeleteTarget(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete');
      setDeleteTarget(null);
    }
  });

  // Filter handlers with URL sync
  const handleZoneChange = useCallback(
    (value: string) => {
      setSelectedZoneId(value);
      setPage(1);
      syncUrlParams(value, statusFilter, search);
    },
    [statusFilter, search]
  );

  const handleStatusChange = useCallback(
    (value: string) => {
      setStatusFilter(value as typeof statusFilter);
      setPage(1);
      syncUrlParams(activeZoneFilter, value, search);
    },
    [activeZoneFilter, search]
  );

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearch(value);
      setPage(1);
      syncUrlParams(activeZoneFilter, statusFilter, value);
    },
    [activeZoneFilter, statusFilter]
  );

  const filtered = useMemo(() => {
    const lowered = search.toLowerCase();

    return devices.filter((device) => {
      const matchSearch =
        device.device_name.toLowerCase().includes(lowered)
        || device.device_id.toLowerCase().includes(lowered)
        || formatPlayerId(device.device_id).toLowerCase().includes(lowered);
      const matchStatus = statusFilter === 'all' || device.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [devices, search, statusFilter]);

  const pageSize = 10;
  const total = filtered.length;
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-4">
      <PageHeader description="Регистрация плееров, назначение в группы и мониторинг статусов" />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <Select value={activeZoneFilter} onValueChange={handleZoneChange}>
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

          <Select value={statusFilter} onValueChange={handleStatusChange}>
            <SelectTrigger className="h-8 w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">active</SelectItem>
              <SelectItem value="pending">pending</SelectItem>
              <SelectItem value="offline">offline</SelectItem>
              <SelectItem value="revoked">revoked</SelectItem>
            </SelectContent>
          </Select>

          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 pl-8"
              value={search}
              onChange={(event) => handleSearchChange(event.target.value)}
              placeholder="Search by name"
            />
          </div>
        </div>

        <Button className="h-8 self-start sm:self-auto" onClick={() => setWizardOpen(true)} disabled={!visibleZones.length}>
          <Plus className="size-4" />
          New player
        </Button>
      </div>

      <RegisterDeviceWizard
        open={isWizardOpen}
        onOpenChange={setWizardOpen}
        onComplete={(zoneId) => {
          if (zoneId) {
            queryClient.invalidateQueries({ queryKey: queryKeys.devices(zoneId) });
          }
          if (activeZoneFilter !== ALL_ZONES_VALUE && activeZoneFilter !== zoneId) {
            queryClient.invalidateQueries({ queryKey: queryKeys.devices(activeZoneFilter) });
          }
        }}
      />

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete player?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.name}</strong> and revoke
              all its credentials. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate({ deviceId: deleteTarget.id, zoneId: deleteTarget.zoneId })}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DataTable
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4 w-[360px]">Device</TableHead>
              <TableHead className="w-[180px]">Type</TableHead>
              <TableHead className="w-[180px]">Status</TableHead>
              <TableHead className="w-[52px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {devicesLoading
              ? Array.from({ length: 6 }).map((_, index) => (
                  <TableRow key={index}>
                    <TableCell colSpan={4}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              : paged.map((device) => (
                  <TableRow key={device.device_id}>
                    <TableCell className="pl-4 w-[360px]">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="truncate font-medium">{device.device_name}</div>
                        <ConnectivityBadge online={device.online === true} />
                      </div>
                    </TableCell>
                    <TableCell className="w-[180px] text-muted-foreground">
                      {formatDeviceType(device.device_type)}
                    </TableCell>
                    <TableCell className="w-[180px]">
                      <StatusBadge
                        tone={
                          device.status === 'active'
                            ? 'success'
                            : device.status === 'pending'
                              ? 'warning'
                              : device.status === 'offline'
                                ? 'danger'
                                : 'neutral'
                        }
                        label={device.status}
                      />
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => router.push(`/devices/${device.device_id}?tab=info`)}>
                            <Info className="mr-2 size-4" />
                            Info
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => router.push(`/devices/${device.device_id}?tab=settings`)}>
                            <Settings className="mr-2 size-4" />
                            Settings
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => router.push(`/devices/${device.device_id}?tab=content`)}>
                            <Film className="mr-2 size-4" />
                            Content
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => router.push(`/devices/${device.device_id}?tab=criteria`)}>
                            <Tags className="mr-2 size-4" />
                            Criteria & Tags
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteTarget({ id: device.device_id, name: device.device_name, zoneId: device.zone_id })}
                          >
                            <Trash2 className="mr-2 size-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>

        {!devicesLoading && !total ? (
          <div className="p-4">
            <EmptyState
              title="No devices"
              description={
                activeZoneFilter === ALL_ZONES_VALUE
                  ? 'По текущим фильтрам устройства не найдены.'
                  : 'В выбранной зоне пока нет устройств. Зарегистрируйте первый player.'
              }
              actionLabel="New player"
              onAction={() => setWizardOpen(true)}
            />
          </div>
        ) : null}
      </DataTable>
    </div>
  );
}
