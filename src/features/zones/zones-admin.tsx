'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/auth/store';
import { hasRole } from '@/auth/guards';
import { DataTable } from '@/components/common/data-table';
import { EmptyState } from '@/components/common/empty-state';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { queryKeys } from '@/lib/query-keys';
import { zoneService } from '@/services/zone-service';

const MAX_ZONE_NAME_LENGTH = 40;

const createZoneSchema = z.object({
  name: z
    .string()
    .min(2, 'Введите название зоны')
    .max(MAX_ZONE_NAME_LENGTH, `Maximum ${MAX_ZONE_NAME_LENGTH} characters`),
  description: z.string().max(140, 'Максимум 140 символов')
});

type CreateZoneForm = z.infer<typeof createZoneSchema>;

const policySchema = z.object({
  max_schedule_slots: z
    .string()
    .min(1, 'Введите значение')
    .refine((value) => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 10_000, {
      message: 'Значение от 1 до 10000'
    }),
  max_content_size_mb: z
    .string()
    .min(1, 'Введите значение')
    .refine((value) => Number.isInteger(Number(value)) && Number(value) >= 10 && Number(value) <= 50_000, {
      message: 'Значение от 10 до 50000'
    }),
  crdt_enabled: z.enum(['true', 'false'])
});

type PolicyForm = z.infer<typeof policySchema>;

export function ZonesAdmin() {
  const queryClient = useQueryClient();
  const roles = useAuthStore((state) => state.roles);
  const allowedZones = useAuthStore((state) => state.zones);
  const isAdmin = hasRole(roles, 'admin');

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [isPolicyOpen, setPolicyOpen] = useState(false);
  const [policyZoneId, setPolicyZoneId] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ zone_id: string; name: string } | null>(null);
  const [zoneNameLimitNotified, setZoneNameLimitNotified] = useState(false);

  const zoneForm = useForm<CreateZoneForm>({
    resolver: zodResolver(createZoneSchema),
    defaultValues: {
      name: '',
      description: ''
    }
  });

  const policyForm = useForm<PolicyForm>({
    resolver: zodResolver(policySchema),
    defaultValues: {
      max_schedule_slots: '500',
      max_content_size_mb: '512',
      crdt_enabled: 'false'
    }
  });

  const zonesQuery = useQuery({
    queryKey: queryKeys.zones,
    queryFn: zoneService.listZones
  });

  const allVisibleZones = useMemo(() => {
    const zones = zonesQuery.data ?? [];
    return isAdmin ? zones : zones.filter((zone) => allowedZones.includes(zone.zone_id));
  }, [allowedZones, isAdmin, zonesQuery.data]);

  const filteredZones = useMemo(() => {
    const lowered = search.toLowerCase();
    return allVisibleZones.filter((zone) => {
      const matchesSearch =
        zone.name.toLowerCase().includes(lowered) ||
        String(zone.description || '').toLowerCase().includes(lowered);
      return matchesSearch;
    });
  }, [allVisibleZones, search]);

  const pageSize = 8;
  const total = filteredZones.length;
  const pagedZones = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredZones.slice(start, start + pageSize);
  }, [page, filteredZones]);

  const policyZone = useMemo(
    () => allVisibleZones.find((zone) => zone.zone_id === policyZoneId),
    [policyZoneId, allVisibleZones]
  );

  const policyQuery = useQuery({
    queryKey: policyZoneId ? queryKeys.zonePolicy(policyZoneId) : ['zones', 'policy', 'empty'],
    queryFn: () => zoneService.getPolicy(policyZoneId),
    enabled: Boolean(policyZoneId) && isPolicyOpen
  });

  const createZone = useMutation({
    mutationFn: zoneService.createZone,
    onSuccess: async () => {
      setCreateOpen(false);
      zoneForm.reset();
      await queryClient.invalidateQueries({ queryKey: queryKeys.zones });
      toast.success('Zone created');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to create zone')
  });

  const savePolicy = useMutation({
    mutationFn: async (values: PolicyForm) => {
      if (!policyZone) throw new Error('Выберите зону');
      return zoneService.setPolicy(policyZone.zone_id, {
        zone_id: policyZone.zone_id,
        max_schedule_slots: Number(values.max_schedule_slots),
        max_content_size_mb: Number(values.max_content_size_mb),
        allowed_content_types: ['video/mp4', 'image/png', 'image/jpeg'],
        crdt_enabled: values.crdt_enabled === 'true',
        max_ops_per_minute: 240,
        max_batch_size: 64,
        priority_rules: []
      });
    },
    onSuccess: async () => {
      if (!policyZone) return;
      await queryClient.invalidateQueries({ queryKey: queryKeys.zonePolicy(policyZone.zone_id) });
      setPolicyOpen(false);
      toast.success('Policy updated');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to save policy')
  });

  const deleteZone = useMutation({
    mutationFn: (zoneId: string) => zoneService.deleteZone(zoneId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.zones });
      setDeleteTarget(null);
      toast.success('Zone deleted');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to delete zone'),
  });

  const syncPolicyForm = useCallback(() => {
    const current = policyQuery.data;
    if (!current) return;

    policyForm.reset({
      max_schedule_slots: String(current.max_schedule_slots),
      max_content_size_mb: String(current.max_content_size_mb),
      crdt_enabled: current.crdt_enabled ? 'true' : 'false'
    });
  }, [policyForm, policyQuery.data]);

  useEffect(() => {
    syncPolicyForm();
  }, [syncPolicyForm]);

  const openPolicyDialog = useCallback((zoneId: string) => {
    setPolicyZoneId(zoneId);
    setPolicyOpen(true);
  }, []);

  return (
    <div className="space-y-4">
      <PageHeader description="Управление зонами вещания, лимитами и CRDT-политиками" />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="zones-quick-search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search by zone name or description"
            className="h-8 pl-9"
          />
        </div>

        {isAdmin ? (
          <Dialog
            open={isCreateOpen}
            onOpenChange={(open) => {
              setCreateOpen(open);
              if (!open) {
                zoneForm.reset();
                setZoneNameLimitNotified(false);
              }
            }}
          >
            <DialogTrigger asChild>
              <Button className="h-8 self-start sm:self-auto">
                <Plus className="size-4" />
                New zone
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create zone</DialogTitle>
                <DialogDescription>Новая зона появится в списке сразу после успешного API-вызова.</DialogDescription>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={zoneForm.handleSubmit((values) => createZone.mutate(values))}
              >
                <div className="space-y-2">
                  <Label htmlFor="zone-name">Name</Label>
                  <Input
                    id="zone-name"
                    {...zoneForm.register('name', {
                      onChange: (event) => {
                        const raw = String(event?.target?.value || '');
                        if (raw.length > MAX_ZONE_NAME_LENGTH) {
                          event.target.value = raw.slice(0, MAX_ZONE_NAME_LENGTH);
                          if (!zoneNameLimitNotified) {
                            toast.error(`Zone name cannot be longer than ${MAX_ZONE_NAME_LENGTH} characters`);
                            setZoneNameLimitNotified(true);
                          }
                          return;
                        }
                        if (zoneNameLimitNotified) {
                          setZoneNameLimitNotified(false);
                        }
                      },
                    })}
                  />
                  <p className="text-xs text-destructive">{zoneForm.formState.errors.name?.message}</p>
                  <p className="text-xs text-muted-foreground">Max {MAX_ZONE_NAME_LENGTH} characters.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="zone-desc">Description</Label>
                  <Input id="zone-desc" {...zoneForm.register('description')} />
                  <p className="text-xs text-destructive">{zoneForm.formState.errors.description?.message}</p>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createZone.isPending}>
                    {createZone.isPending ? 'Creating...' : 'Create zone'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>

      <DataTable
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-[52px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {zonesQuery.isLoading
              ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">
                      Loading zones...
                    </TableCell>
                  </TableRow>
                )
              : pagedZones.map((zone) => (
                  <TableRow key={zone.zone_id}>
                    <TableCell className="pl-4 font-medium">{zone.name}</TableCell>
                    <TableCell className="max-w-[360px] truncate text-muted-foreground">
                      {zone.description || '—'}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openPolicyDialog(zone.zone_id)}>
                            Edit policy
                          </DropdownMenuItem>
                          {isAdmin ? (
                            <DropdownMenuItem
                              onClick={() => setDeleteTarget({ zone_id: zone.zone_id, name: zone.name })}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="mr-2 size-4" />
                              Delete zone
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>

        {!zonesQuery.isLoading && !total ? (
          <div className="p-4">
            <EmptyState title="No zones found" description="Создайте первую зону или измените строку поиска." />
          </div>
        ) : null}
      </DataTable>

      <Dialog open={isPolicyOpen} onOpenChange={setPolicyOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Zone policy</DialogTitle>
            <DialogDescription>
              {policyZone ? `Настройка лимитов и CRDT-политики для зоны «${policyZone.name}»` : 'Загрузка…'}
            </DialogDescription>
          </DialogHeader>

          {policyQuery.isLoading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Loading zone policy...</div>
          ) : (
            <form
              className="space-y-4"
              onSubmit={policyForm.handleSubmit((values) => savePolicy.mutate(values))}
            >
              <div className="space-y-2">
                <Label>Max schedule slots</Label>
                <Input type="number" {...policyForm.register('max_schedule_slots')} />
                <p className="text-xs text-destructive">{policyForm.formState.errors.max_schedule_slots?.message}</p>
              </div>

              <div className="space-y-2">
                <Label>Max content size (MB)</Label>
                <Input type="number" {...policyForm.register('max_content_size_mb')} />
                <p className="text-xs text-destructive">{policyForm.formState.errors.max_content_size_mb?.message}</p>
              </div>

              <div className="space-y-2">
                <Label>CRDT mode</Label>
                <Select value={policyForm.watch('crdt_enabled')} onValueChange={(value) => policyForm.setValue('crdt_enabled', value as 'true' | 'false')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Enabled</SelectItem>
                    <SelectItem value="false">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <DialogFooter>
                <Button type="submit" disabled={savePolicy.isPending}>
                  {savePolicy.isPending ? 'Saving...' : 'Save policy'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete zone</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete zone <strong>{deleteTarget?.name}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!deleteTarget) return;
                deleteZone.mutate(deleteTarget.zone_id);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
