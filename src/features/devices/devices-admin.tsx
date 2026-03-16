'use client';

import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

function formatDeviceType(type: string | null | undefined): string {
  if (!type) return '—';
  return DEVICE_TYPE_LABELS[type] ?? type;
}

/* ─── URL sync helper ──────────────────────────────────────────── */

function syncUrlParams(zone: string, status: string, q: string) {
  const params = new URLSearchParams();
  if (zone) params.set('zone', zone);
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
  const [selectedZoneId, setSelectedZoneId] = useState(searchParams.get('zone') || '');
  const [isWizardOpen, setWizardOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const zonesQuery = useQuery({ queryKey: queryKeys.zones, queryFn: zoneService.listZones });

  const visibleZones = useMemo(() => {
    const zones = zonesQuery.data ?? [];
    return isAdmin ? zones : zones.filter((zone) => allowedZones.includes(zone.zone_id));
  }, [allowedZones, isAdmin, zonesQuery.data]);

  const effectiveZoneId = selectedZoneId || visibleZones[0]?.zone_id || '';

  const devicesQuery = useQuery({
    queryKey: effectiveZoneId ? queryKeys.devices(effectiveZoneId) : ['devices', 'none'],
    queryFn: () => deviceService.listByZone(effectiveZoneId),
    enabled: Boolean(effectiveZoneId)
  });

  const deleteMutation = useMutation({
    mutationFn: (deviceId: string) => deviceService.deleteDevice(deviceId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.devices(effectiveZoneId) });
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
      syncUrlParams(effectiveZoneId, value, search);
    },
    [effectiveZoneId, search]
  );

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearch(value);
      setPage(1);
      syncUrlParams(effectiveZoneId, statusFilter, value);
    },
    [effectiveZoneId, statusFilter]
  );

  const filtered = useMemo(() => {
    const rows = devicesQuery.data ?? [];
    const lowered = search.toLowerCase();

    return rows.filter((device) => {
      const matchSearch =
        device.device_name.toLowerCase().includes(lowered)
        || device.device_id.toLowerCase().includes(lowered)
        || formatPlayerId(device.device_id).toLowerCase().includes(lowered);
      const matchStatus = statusFilter === 'all' || device.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [devicesQuery.data, search, statusFilter]);

  const pageSize = 10;
  const total = filtered.length;
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-4">
      <PageHeader
        description="Регистрация плееров, назначение в группы и мониторинг статусов"
        actions={
          <Button onClick={() => setWizardOpen(true)}>
            <Plus className="size-4" />
            Register player
          </Button>
        }
      />

      <RegisterDeviceWizard
        open={isWizardOpen}
        onOpenChange={setWizardOpen}
        onComplete={(zoneId) => {
          if (zoneId) {
            setSelectedZoneId(zoneId);
            queryClient.invalidateQueries({ queryKey: queryKeys.devices(zoneId) });
            syncUrlParams(zoneId, statusFilter, search);
          }
          queryClient.invalidateQueries({ queryKey: queryKeys.devices(effectiveZoneId) });
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
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
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
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="shrink-0 text-sm text-muted-foreground">Zone:</span>
              <Select value={effectiveZoneId} onValueChange={handleZoneChange}>
                <SelectTrigger className="w-[180px]">
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
            </div>

            <div className="flex items-center gap-1.5">
              <span className="shrink-0 text-sm text-muted-foreground">Status:</span>
              <Select value={statusFilter} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-[160px]">
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
            </div>

            <div className="relative w-[260px]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                value={search}
                onChange={(event) => handleSearchChange(event.target.value)}
                placeholder="Search by name"
              />
            </div>
          </div>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Device</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[52px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {devicesQuery.isLoading
              ? Array.from({ length: 6 }).map((_, index) => (
                  <TableRow key={index}>
                    <TableCell colSpan={4}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              : paged.map((device) => (
                  <TableRow key={device.device_id}>
                    <TableCell className="pl-4">
                      <div className="font-medium">{device.device_name}</div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDeviceType(device.device_type)}
                    </TableCell>
                    <TableCell>
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
                            onClick={() => setDeleteTarget({ id: device.device_id, name: device.device_name })}
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

        {!devicesQuery.isLoading && !total ? (
          <div className="p-4">
            <EmptyState
              title="No devices"
              description="В выбранной зоне пока нет устройств. Зарегистрируйте первый player."
              actionLabel="Register player"
              onAction={() => setWizardOpen(true)}
            />
          </div>
        ) : null}
      </DataTable>
    </div>
  );
}
