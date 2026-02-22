'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuthStore } from '@/auth/store';
import { hasRole } from '@/auth/guards';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { queryKeys } from '@/lib/query-keys';
import { deviceService } from '@/services/device-service';
import { zoneService } from '@/services/zone-service';
import type { RegisterDeviceRequest } from '@/types/api';

const EMPTY_FORM: RegisterDeviceRequest = {
  device_name: '',
  device_type: 'web',
  hardware_id: '',
  zone_id: '',
  group_id: ''
};

export function DevicesAdmin() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<RegisterDeviceRequest>(EMPTY_FORM);
  const [selectedZoneId, setSelectedZoneId] = useState('');

  const roles = useAuthStore((state) => state.roles);
  const allowedZones = useAuthStore((state) => state.zones);
  const isAdmin = hasRole(roles, 'admin');

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

  const groupsQuery = useQuery({
    queryKey: effectiveZoneId ? queryKeys.zoneGroups(effectiveZoneId) : ['groups', 'none'],
    queryFn: () => zoneService.listGroups(effectiveZoneId),
    enabled: Boolean(effectiveZoneId)
  });

  const devicesQuery = useQuery({
    queryKey: queryKeys.devices(effectiveZoneId),
    queryFn: () => deviceService.listByZone(effectiveZoneId),
    enabled: Boolean(effectiveZoneId)
  });

  const registerMutation = useMutation({
    mutationFn: deviceService.register,
    onSuccess: async () => {
      setForm((prev) => ({ ...EMPTY_FORM, zone_id: prev.zone_id }));
      await queryClient.invalidateQueries({ queryKey: queryKeys.devices(effectiveZoneId) });
      toast.success('Device зарегистрирован');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Ошибка регистрации')
  });

  const assignMutation = useMutation({
    mutationFn: ({ deviceId, groupId }: { deviceId: string; groupId: string }) =>
      deviceService.assign(deviceId, groupId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.devices(effectiveZoneId) });
      toast.success('Device назначен на группу');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Ошибка назначения')
  });

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Device Registration</CardTitle>
          <CardDescription>Регистрация и assignment на zone/group</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Zone</Label>
            <Select
              value={form.zone_id || effectiveZoneId}
              onChange={(event) => {
                setSelectedZoneId(event.target.value);
                setForm((prev) => ({ ...prev, zone_id: event.target.value, group_id: '' }));
              }}
            >
              <option value="">Выберите зону</option>
              {visibleZones.map((zone) => (
                <option key={zone.zone_id} value={zone.zone_id}>
                  {zone.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Group</Label>
            <Select
              value={form.group_id}
              onChange={(event) => setForm((prev) => ({ ...prev, group_id: event.target.value }))}
            >
              <option value="">Выберите группу</option>
              {(groupsQuery.data ?? []).map((group) => (
                <option key={group.group_id} value={group.group_id}>
                  {group.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Device name</Label>
            <Input
              value={form.device_name}
              onChange={(event) => setForm((prev) => ({ ...prev, device_name: event.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select
              value={form.device_type}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  device_type: event.target.value as RegisterDeviceRequest['device_type']
                }))
              }
            >
              <option value="web">web</option>
              <option value="desktop">desktop</option>
              <option value="android_tv">android_tv</option>
            </Select>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Hardware ID</Label>
            <Input
              value={form.hardware_id}
              onChange={(event) => setForm((prev) => ({ ...prev, hardware_id: event.target.value }))}
            />
          </div>
          <div className="md:col-span-2">
            <Button
              onClick={() => registerMutation.mutate(form)}
              disabled={!form.device_name || !form.zone_id || !form.group_id || registerMutation.isPending}
            >
              Зарегистрировать device
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Devices</CardTitle>
          <CardDescription>Список по зоне и online/offline статус</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-w-sm">
            <Label>Zone filter</Label>
            <Select value={effectiveZoneId} onChange={(event) => setSelectedZoneId(event.target.value)}>
              {visibleZones.map((zone) => (
                <option key={zone.zone_id} value={zone.zone_id}>
                  {zone.name}
                </option>
              ))}
            </Select>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Device</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Group</TableHead>
                <TableHead>Assign</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(devicesQuery.data ?? []).map((device) => (
                <TableRow key={device.device_id}>
                  <TableCell>
                    <div className="font-medium">{device.device_name}</div>
                    <div className="font-mono text-xs text-muted-foreground">{device.device_id}</div>
                  </TableCell>
                  <TableCell>{device.device_type}</TableCell>
                  <TableCell>
                    <Badge
                      variant={device.status === 'active' ? 'success' : device.status === 'offline' ? 'destructive' : 'secondary'}
                    >
                      {device.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{device.group_id}</TableCell>
                  <TableCell>
                    <Select
                      defaultValue={device.group_id}
                      onChange={(event) =>
                        assignMutation.mutate({ deviceId: device.device_id, groupId: event.target.value })
                      }
                    >
                      {(groupsQuery.data ?? []).map((group) => (
                        <option key={group.group_id} value={group.group_id}>
                          {group.name}
                        </option>
                      ))}
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
