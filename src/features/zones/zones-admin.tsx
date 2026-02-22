'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuthStore } from '@/auth/store';
import { hasRole } from '@/auth/guards';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select } from '@/components/ui/select';
import { queryKeys } from '@/lib/query-keys';
import { zoneService } from '@/services/zone-service';

export function ZonesAdmin() {
  const queryClient = useQueryClient();
  const roles = useAuthStore((state) => state.roles);
  const allowedZones = useAuthStore((state) => state.zones);
  const isAdmin = hasRole(roles, 'admin');

  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneDescription, setNewZoneDescription] = useState('');
  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [newGroupName, setNewGroupName] = useState('');

  const zonesQuery = useQuery({
    queryKey: queryKeys.zones,
    queryFn: zoneService.listZones
  });

  const visibleZones = useMemo(() => {
    const zones = zonesQuery.data ?? [];
    if (isAdmin) {
      return zones;
    }

    return zones.filter((zone) => allowedZones.includes(zone.zone_id));
  }, [allowedZones, isAdmin, zonesQuery.data]);

  const selectedZone = visibleZones.find((zone) => zone.zone_id === selectedZoneId) ?? visibleZones[0];

  const groupsQuery = useQuery({
    queryKey: selectedZone ? queryKeys.zoneGroups(selectedZone.zone_id) : ['groups', 'none'],
    queryFn: () => zoneService.listGroups(selectedZone.zone_id),
    enabled: Boolean(selectedZone)
  });

  const policyQuery = useQuery({
    queryKey: selectedZone ? queryKeys.zonePolicy(selectedZone.zone_id) : ['policy', 'none'],
    queryFn: () => zoneService.getPolicy(selectedZone.zone_id),
    enabled: Boolean(selectedZone)
  });

  const createZone = useMutation({
    mutationFn: zoneService.createZone,
    onSuccess: async () => {
      setNewZoneName('');
      setNewZoneDescription('');
      await queryClient.invalidateQueries({ queryKey: queryKeys.zones });
      toast.success('Zone создана');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Ошибка создания зоны')
  });

  const savePolicy = useMutation({
    mutationFn: (payload: {
      zoneId: string;
      max_schedule_slots: number;
      max_content_size_mb: number;
      crdt_enabled: boolean;
    }) =>
      zoneService.setPolicy(payload.zoneId, {
        zone_id: payload.zoneId,
        max_schedule_slots: payload.max_schedule_slots,
        max_content_size_mb: payload.max_content_size_mb,
        allowed_content_types: ['video/mp4', 'image/png', 'image/jpeg'],
        crdt_enabled: payload.crdt_enabled,
        max_ops_per_minute: 240,
        max_batch_size: 64,
        priority_rules: []
      }),
    onSuccess: async () => {
      if (!selectedZone) return;
      await queryClient.invalidateQueries({ queryKey: queryKeys.zonePolicy(selectedZone.zone_id) });
      toast.success('Policy обновлена');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Ошибка policy')
  });

  const currentPolicy = policyQuery.data;

  const createGroup = useMutation({
    mutationFn: ({ zoneId, name }: { zoneId: string; name: string }) => zoneService.createGroup(zoneId, { name }),
    onSuccess: async () => {
      if (!selectedZone) return;
      setNewGroupName('');
      await queryClient.invalidateQueries({ queryKey: queryKeys.zoneGroups(selectedZone.zone_id) });
      toast.success('Группа создана');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Ошибка создания группы')
  });

  const deleteGroup = useMutation({
    mutationFn: ({ zoneId, groupId }: { zoneId: string; groupId: string }) =>
      zoneService.deleteGroup(zoneId, groupId),
    onSuccess: async () => {
      if (!selectedZone) return;
      await queryClient.invalidateQueries({ queryKey: queryKeys.zoneGroups(selectedZone.zone_id) });
      toast.success('Группа удалена');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Ошибка удаления группы')
  });

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Zones</CardTitle>
          <CardDescription>CRUD и zone policy (scope-aware)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isAdmin ? (
            <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
              <Input
                value={newZoneName}
                placeholder="Название зоны"
                onChange={(event) => setNewZoneName(event.target.value)}
              />
              <Input
                value={newZoneDescription}
                placeholder="Описание"
                onChange={(event) => setNewZoneDescription(event.target.value)}
              />
              <Button
                onClick={() => createZone.mutate({ name: newZoneName, description: newZoneDescription })}
                disabled={!newZoneName.trim() || createZone.isPending}
              >
                Создать зону
              </Button>
            </div>
          ) : null}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Название</TableHead>
                <TableHead>Описание</TableHead>
                <TableHead>Scope</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleZones.map((zone) => (
                <TableRow key={zone.zone_id}>
                  <TableCell className="font-mono text-xs">{zone.zone_id}</TableCell>
                  <TableCell>{zone.name}</TableCell>
                  <TableCell>{zone.description || '—'}</TableCell>
                  <TableCell>
                    <Badge variant={allowedZones.includes(zone.zone_id) ? 'success' : 'secondary'}>
                      {allowedZones.includes(zone.zone_id) ? 'allowed' : 'read-only'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Policy + Screen Groups</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-sm">
            <Label>Зона</Label>
            <Select
              value={selectedZone?.zone_id ?? ''}
              onChange={(event) => setSelectedZoneId(event.target.value)}
            >
              {visibleZones.map((zone) => (
                <option key={zone.zone_id} value={zone.zone_id}>
                  {zone.name}
                </option>
              ))}
            </Select>
          </div>

          {selectedZone && currentPolicy ? (
            <div className="grid gap-2 rounded-md border p-4 md:grid-cols-4">
              <div>
                <Label>Max slots</Label>
                <Input
                  defaultValue={String(currentPolicy.max_schedule_slots)}
                  onBlur={(event) => {
                    savePolicy.mutate({
                      zoneId: selectedZone.zone_id,
                      max_schedule_slots: Number(event.target.value),
                      max_content_size_mb: currentPolicy.max_content_size_mb,
                      crdt_enabled: currentPolicy.crdt_enabled
                    });
                  }}
                />
              </div>
              <div>
                <Label>Max size MB</Label>
                <Input
                  defaultValue={String(currentPolicy.max_content_size_mb)}
                  onBlur={(event) => {
                    savePolicy.mutate({
                      zoneId: selectedZone.zone_id,
                      max_schedule_slots: currentPolicy.max_schedule_slots,
                      max_content_size_mb: Number(event.target.value),
                      crdt_enabled: currentPolicy.crdt_enabled
                    });
                  }}
                />
              </div>
              <div className="flex items-end">
                <Button
                  variant={currentPolicy.crdt_enabled ? 'success' : 'outline'}
                  onClick={() =>
                    savePolicy.mutate({
                      zoneId: selectedZone.zone_id,
                      max_schedule_slots: currentPolicy.max_schedule_slots,
                      max_content_size_mb: currentPolicy.max_content_size_mb,
                      crdt_enabled: !currentPolicy.crdt_enabled
                    })
                  }
                >
                  CRDT: {currentPolicy.crdt_enabled ? 'ON' : 'OFF'}
                </Button>
              </div>
            </div>
          ) : null}

          {selectedZone ? (
            <div className="space-y-3">
              <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                <Input
                  value={newGroupName}
                  placeholder="Новая screen group"
                  onChange={(event) => setNewGroupName(event.target.value)}
                />
                <Button
                  onClick={() => createGroup.mutate({ zoneId: selectedZone.zone_id, name: newGroupName })}
                  disabled={!newGroupName.trim()}
                >
                  Добавить группу
                </Button>
              </div>

              <div className="rounded-md border">
                {(groupsQuery.data ?? []).map((group) => (
                  <div key={group.group_id} className="flex items-center justify-between border-b px-3 py-2 last:border-b-0">
                    <span>{group.name}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        deleteGroup.mutate({ zoneId: selectedZone.zone_id, groupId: group.group_id })
                      }
                    >
                      Удалить
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
