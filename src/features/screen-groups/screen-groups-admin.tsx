'use client';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { zoneService } from '@/services/zone-service';

const createGroupSchema = z.object({
  name: z.string().min(2, 'Введите название группы')
});

type CreateGroupForm = z.infer<typeof createGroupSchema>;

export function ScreenGroupsAdmin() {
  const queryClient = useQueryClient();
  const roles = useAuthStore((state) => state.roles);
  const allowedZones = useAuthStore((state) => state.zones);
  const isAdmin = hasRole(roles, 'admin');

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [isCreateOpen, setCreateOpen] = useState(false);

  const form = useForm<CreateGroupForm>({
    resolver: zodResolver(createGroupSchema),
    defaultValues: { name: '' }
  });

  const zonesQuery = useQuery({
    queryKey: queryKeys.zones,
    queryFn: zoneService.listZones
  });

  const visibleZones = useMemo(() => {
    const zones = zonesQuery.data ?? [];
    return isAdmin ? zones : zones.filter((zone) => allowedZones.includes(zone.zone_id));
  }, [allowedZones, isAdmin, zonesQuery.data]);

  const effectiveZoneId = selectedZoneId || visibleZones[0]?.zone_id || '';

  const groupsQuery = useQuery({
    queryKey: effectiveZoneId ? queryKeys.zoneGroups(effectiveZoneId) : ['screen-groups', 'none'],
    queryFn: () => zoneService.listGroups(effectiveZoneId),
    enabled: Boolean(effectiveZoneId)
  });

  const filtered = useMemo(() => {
    const rows = groupsQuery.data ?? [];
    const lowered = search.toLowerCase();
    return rows.filter(
      (group) => group.name.toLowerCase().includes(lowered) || group.group_id.toLowerCase().includes(lowered)
    );
  }, [groupsQuery.data, search]);

  const pageSize = 10;
  const total = filtered.length;
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const createGroup = useMutation({
    mutationFn: (values: CreateGroupForm) => zoneService.createGroup(effectiveZoneId, values),
    onSuccess: async () => {
      setCreateOpen(false);
      form.reset();
      await queryClient.invalidateQueries({ queryKey: queryKeys.zoneGroups(effectiveZoneId) });
      toast.success('Group created');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to create group')
  });

  const deleteGroup = useMutation({
    mutationFn: (groupId: string) => zoneService.deleteGroup(effectiveZoneId, groupId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.zoneGroups(effectiveZoneId) });
      toast.success('Group removed');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to remove group')
  });

  return (
    <div className="space-y-4">
      <PageHeader
        description="CRUD групп экранов внутри выбранной зоны"
        actions={
          <Dialog open={isCreateOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button disabled={!effectiveZoneId}>
                <Plus className="size-4" />
                New group
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create screen group</DialogTitle>
                <DialogDescription>
                  Группа будет создана в зоне <span className="font-mono">{effectiveZoneId || 'N/A'}</span>.
                </DialogDescription>
              </DialogHeader>
              <form className="space-y-4" onSubmit={form.handleSubmit((values) => createGroup.mutate(values))}>
                <div className="space-y-2">
                  <Label htmlFor="group-name">Group name</Label>
                  <Input id="group-name" {...form.register('name')} />
                  <p className="text-xs text-destructive">{form.formState.errors.name?.message}</p>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createGroup.isPending}>
                    {createGroup.isPending ? 'Creating...' : 'Create'}
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
            <div className="flex items-center gap-1.5">
              <span className="shrink-0 text-sm text-muted-foreground">Zone:</span>
              <Select
                value={effectiveZoneId}
                onValueChange={(value) => {
                  setSelectedZoneId(value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[180px]">
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
            <div className="relative w-[260px]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search group"
                className="pl-8"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Group name</TableHead>
              <TableHead>ID</TableHead>
              <TableHead>Zone</TableHead>
              <TableHead className="w-[52px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {groupsQuery.isLoading
              ? Array.from({ length: 6 }).map((_, index) => (
                  <TableRow key={index}>
                    <TableCell colSpan={4}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              : paged.map((group) => (
                  <TableRow key={group.group_id}>
                    <TableCell className="pl-4 font-medium">{group.name}</TableCell>
                    <TableCell className="font-mono text-xs">{group.group_id}</TableCell>
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
                          <DropdownMenuItem
                            onClick={async () => {
                              await navigator.clipboard.writeText(group.group_id);
                              toast.success('Group ID copied');
                            }}
                          >
                            Copy ID
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => deleteGroup.mutate(group.group_id)}
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

        {!groupsQuery.isLoading && !total ? (
          <div className="p-4">
            <EmptyState
              icon={<Tv className="size-8" />}
              title="No screen groups"
              description="Создайте первую группу экранов для выбранной зоны."
              actionLabel="Create group"
              onAction={() => setCreateOpen(true)}
            />
          </div>
        ) : null}
      </DataTable>
    </div>
  );
}
