'use client';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Plus, Search } from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
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
import { deviceService } from '@/services/device-service';
import { zoneService } from '@/services/zone-service';
import type { RegisterDeviceRequest } from '@/types/api';

const registerSchema = z.object({
  device_name: z.string().min(2, 'Введите имя устройства'),
  device_type: z.enum(['web', 'desktop', 'android_tv']),
  hardware_id: z.string().optional(),
  zone_id: z.string().min(1, 'Выберите зону'),
  group_id: z.string().min(1, 'Выберите группу')
});

type RegisterForm = z.infer<typeof registerSchema>;

export function DevicesAdmin() {
  const queryClient = useQueryClient();
  const roles = useAuthStore((state) => state.roles);
  const allowedZones = useAuthStore((state) => state.zones);
  const isAdmin = hasRole(roles, 'admin');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'pending' | 'offline' | 'revoked'>('all');
  const [page, setPage] = useState(1);
  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [isDialogOpen, setDialogOpen] = useState(false);

  const form = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      device_name: '',
      device_type: 'web',
      hardware_id: '',
      zone_id: '',
      group_id: ''
    }
  });

  const zonesQuery = useQuery({ queryKey: queryKeys.zones, queryFn: zoneService.listZones });

  const visibleZones = useMemo(() => {
    const zones = zonesQuery.data ?? [];
    return isAdmin ? zones : zones.filter((zone) => allowedZones.includes(zone.zone_id));
  }, [allowedZones, isAdmin, zonesQuery.data]);

  const effectiveZoneId = selectedZoneId || form.watch('zone_id') || visibleZones[0]?.zone_id || '';

  const groupsQuery = useQuery({
    queryKey: effectiveZoneId ? queryKeys.zoneGroups(effectiveZoneId) : ['devices', 'groups', 'none'],
    queryFn: () => zoneService.listGroups(effectiveZoneId),
    enabled: Boolean(effectiveZoneId)
  });

  const devicesQuery = useQuery({
    queryKey: effectiveZoneId ? queryKeys.devices(effectiveZoneId) : ['devices', 'none'],
    queryFn: () => deviceService.listByZone(effectiveZoneId),
    enabled: Boolean(effectiveZoneId)
  });

  const registerMutation = useMutation({
    mutationFn: (payload: RegisterDeviceRequest) => deviceService.register(payload),
    onSuccess: async () => {
      setDialogOpen(false);
      form.reset({
        device_name: '',
        device_type: 'web',
        hardware_id: '',
        zone_id: effectiveZoneId,
        group_id: ''
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.devices(effectiveZoneId) });
      toast.success('Device registered');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Registration failed')
  });

  const assignMutation = useMutation({
    mutationFn: ({ deviceId, groupId }: { deviceId: string; groupId: string }) =>
      deviceService.assign(deviceId, groupId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.devices(effectiveZoneId) });
      toast.success('Device reassigned');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to assign device')
  });

  const filtered = useMemo(() => {
    const rows = devicesQuery.data ?? [];
    const lowered = search.toLowerCase();

    return rows.filter((device) => {
      const matchSearch =
        device.device_name.toLowerCase().includes(lowered) || device.device_id.toLowerCase().includes(lowered);
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
          <Dialog open={isDialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4" />
                Register device
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Register new device</DialogTitle>
                <DialogDescription>После регистрации устройство получит device token и появится в списке.</DialogDescription>
              </DialogHeader>
              <form className="grid gap-3" onSubmit={form.handleSubmit((values) => registerMutation.mutate(values))}>
                <div className="space-y-2">
                  <Label>Zone</Label>
                  <Select
                    value={form.watch('zone_id') || effectiveZoneId}
                    onValueChange={(value) => {
                      form.setValue('zone_id', value, { shouldValidate: true });
                      form.setValue('group_id', '', { shouldValidate: true });
                    }}
                  >
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
                  <p className="text-xs text-destructive">{form.formState.errors.zone_id?.message}</p>
                </div>

                <div className="space-y-2">
                  <Label>Screen group</Label>
                  <Select
                    value={form.watch('group_id')}
                    onValueChange={(value) => form.setValue('group_id', value, { shouldValidate: true })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select group" />
                    </SelectTrigger>
                    <SelectContent>
                      {(groupsQuery.data ?? []).map((group) => (
                        <SelectItem key={group.group_id} value={group.group_id}>
                          {group.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-destructive">{form.formState.errors.group_id?.message}</p>
                </div>

                <div className="space-y-2">
                  <Label>Device name</Label>
                  <Input {...form.register('device_name')} />
                  <p className="text-xs text-destructive">{form.formState.errors.device_name?.message}</p>
                </div>

                <div className="space-y-2">
                  <Label>Device type</Label>
                  <Select
                    value={form.watch('device_type')}
                    onValueChange={(value) =>
                      form.setValue('device_type', value as RegisterForm['device_type'], { shouldValidate: true })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="web">web</SelectItem>
                      <SelectItem value="desktop">desktop</SelectItem>
                      <SelectItem value="android_tv">android_tv</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Hardware ID</Label>
                  <Input {...form.register('hardware_id')} />
                </div>

                <DialogFooter>
                  <Button type="submit" disabled={registerMutation.isPending}>
                    {registerMutation.isPending ? 'Registering...' : 'Register'}
                  </Button>
                </DialogFooter>
              </form>
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

            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
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

            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search by name or id"
              />
            </div>
          </div>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Device</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Group</TableHead>
              <TableHead className="w-[52px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {devicesQuery.isLoading
              ? Array.from({ length: 6 }).map((_, index) => (
                  <TableRow key={index}>
                    <TableCell colSpan={5}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              : paged.map((device) => (
                  <TableRow key={device.device_id}>
                    <TableCell>
                      <div className="font-medium">{device.device_name}</div>
                      <div className="font-mono text-xs text-muted-foreground">{device.device_id}</div>
                    </TableCell>
                    <TableCell>{device.device_type}</TableCell>
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
                      <Select
                        value={device.group_id}
                        onValueChange={(groupId) => assignMutation.mutate({ deviceId: device.device_id, groupId })}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder="Assign group" />
                        </SelectTrigger>
                        <SelectContent>
                          {(groupsQuery.data ?? []).map((group) => (
                            <SelectItem key={group.group_id} value={group.group_id}>
                              {group.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={async () => {
                              await navigator.clipboard.writeText(device.device_id);
                              toast.success('Device ID copied');
                            }}
                          >
                            Copy ID
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
              actionLabel="Register device"
              onAction={() => setDialogOpen(true)}
            />
          </div>
        ) : null}
      </DataTable>
    </div>
  );
}
