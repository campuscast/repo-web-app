'use client';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { MoreHorizontal, Plus, Search, Tv } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/auth/store';
import { hasRole } from '@/auth/guards';
import { DataTable } from '@/components/common/data-table';
import { EmptyState } from '@/components/common/empty-state';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { zoneService } from '@/services/zone-service';

const createGroupSchema = z.object({
  name: z.string().min(2, 'Введите название группы'),
  description: z.string().max(140, 'Максимум 140 символов').optional(),
  zone_id: z.string().min(1, 'Выберите зону')
});

type CreateGroupForm = z.infer<typeof createGroupSchema>;

const ALL_ZONES_VALUE = '__all_zones__';

export function ScreenGroupsAdmin() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const roles = useAuthStore((state) => state.roles);
  const allowedZones = useAuthStore((state) => state.zones);
  const isAdmin = hasRole(roles, 'admin');

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedZoneId, setSelectedZoneId] = useState(ALL_ZONES_VALUE);
  const [isCreateOpen, setCreateOpen] = useState(false);

  const form = useForm<CreateGroupForm>({
    resolver: zodResolver(createGroupSchema),
    defaultValues: { name: '', description: '', zone_id: '' }
  });

  const zonesQuery = useQuery({
    queryKey: queryKeys.zones,
    queryFn: zoneService.listZones
  });

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

  const groupQueries = useQueries({
    queries: zoneIdsForList.map((zoneId) => ({
      queryKey: queryKeys.zoneGroups(zoneId),
      queryFn: () => zoneService.listGroups(zoneId),
      enabled: Boolean(zoneId)
    }))
  });

  const groupsLoading = zonesQuery.isLoading || groupQueries.some((query) => query.isLoading);
  const groups = groupQueries.flatMap((query) => query.data ?? []);

  const filtered = useMemo(() => {
    const lowered = search.toLowerCase();
    return groups.filter(
      group =>
        group.name.toLowerCase().includes(lowered) ||
        String(group.description || '').toLowerCase().includes(lowered)
    );
  }, [groups, search]);

  const pageSize = 10;
  const total = filtered.length;
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const createGroup = useMutation({
    mutationFn: ({ zone_id, name, description }: CreateGroupForm) => zoneService.createGroup(zone_id, { name, description }),
    onSuccess: async (_result, values) => {
      setCreateOpen(false);
      form.reset({ name: '', description: '', zone_id: '' });
      await queryClient.invalidateQueries({ queryKey: queryKeys.zoneGroups(values.zone_id) });
      toast.success('Group created');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to create group')
  });

  const deleteGroup = useMutation({
    mutationFn: ({ groupId, zoneId }: { groupId: string; zoneId: string }) => zoneService.deleteGroup(zoneId, groupId),
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.zoneGroups(variables.zoneId) });
      toast.success('Group removed');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to remove group')
  });

  const openCreateDialog = () => {
    if (!visibleZones.length) {
      toast.error('Создайте или получите доступ хотя бы к одной зоне');
      return;
    }

    form.reset({ name: '', description: '', zone_id: '' });
    setCreateOpen(true);
  };

  return (
    <div className="space-y-4">
      <PageHeader description="Управление группами экранов по зонам" />

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

          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search group"
              className="h-8 pl-8"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>

        <Button className="h-8 self-start sm:self-auto" onClick={openCreateDialog} disabled={!visibleZones.length}>
          <Plus className="size-4" />
          New group
        </Button>
      </div>

      <Dialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) {
            form.reset({ name: '', description: '', zone_id: '' });
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create screen group</DialogTitle>
            <DialogDescription>
              Укажите название группы и выберите зону, к которой она будет принадлежать.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={form.handleSubmit((values) => createGroup.mutate(values))}>
            <div className="space-y-2">
              <Label htmlFor="group-name">Group name</Label>
              <Input id="group-name" {...form.register('name')} />
              <p className="text-xs text-destructive">{form.formState.errors.name?.message}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="group-description">Description <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
              <Input id="group-description" {...form.register('description')} />
              <p className="text-xs text-destructive">{form.formState.errors.description?.message}</p>
            </div>
            <div className="space-y-2">
              <Label>Zone</Label>
              <Select
                value={form.watch('zone_id')}
                onValueChange={(value) => form.setValue('zone_id', value, { shouldValidate: true })}
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
              <p className="text-xs text-destructive">{form.formState.errors.zone_id?.message}</p>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={createGroup.isPending}>
                {createGroup.isPending ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DataTable
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
      >
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[22%] pl-4">Group name</TableHead>
              <TableHead className="w-[46%] whitespace-normal">Description</TableHead>
              <TableHead className="w-[26%]">Zone</TableHead>
              <TableHead className="w-[52px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {groupsLoading
              ? Array.from({ length: 6 }).map((_, index) => (
                  <TableRow key={index}>
                    <TableCell colSpan={4}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              : paged.map((group) => (
                  <TableRow key={group.group_id}>
                    <TableCell className="max-w-[240px] truncate pl-4 font-medium">{group.name}</TableCell>
                    <TableCell className="whitespace-normal break-words text-muted-foreground">{group.description || '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {visibleZones.find((z) => z.zone_id === group.zone_id)?.name ?? group.zone_id}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => router.push(`/screen-groups/${group.group_id}/compose?zoneId=${group.zone_id}`)}>
                            Compose
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => deleteGroup.mutate({ groupId: group.group_id, zoneId: group.zone_id })}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>

        {!groupsLoading && !total ? (
          <div className="p-4">
            <EmptyState
              icon={<Tv className="size-8" />}
              title="No screen groups"
              description={
                activeZoneFilter === ALL_ZONES_VALUE
                  ? 'По текущим фильтрам группы экранов не найдены.'
                  : 'Создайте первую группу экранов для выбранной зоны.'
              }
              actionLabel="Create group"
              onAction={openCreateDialog}
            />
          </div>
        ) : null}
      </DataTable>
    </div>
  );
}
