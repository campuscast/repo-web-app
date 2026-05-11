'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MoreHorizontal, Plus, RotateCw, Shield, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuthStore } from '@/auth/store';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { Badge } from '@/components/ui/badge';
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
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useLocale } from '@/hooks/use-locale';
import { createRole, deleteRole, listRoles } from '@/services/user-admin-service';
import type { AdminRole } from '@/types/api';
import {
  buildPermissionGroups,
  collectKnownPermissions,
  getGrantedPermissionsForGroup,
  hasWildcardPermission,
  isLockedRole,
  isSystemRole,
} from '@/features/roles/role-permissions';

const PAGE_SIZE = 10;

export default function RolesAdminPage() {
  const router = useRouter();
  const { t } = useLocale();
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const canRead = isAdmin() || hasPermission('users.read');
  const canWrite = isAdmin() || hasPermission('users.write');
  const canDeleteRoles = isAdmin();
  const resourceLabels = useMemo(
    (): Record<string, string> => ({
      users: t('nav.users'),
      roles: t('nav.roles'),
      zones: t('nav.zones'),
      devices: t('nav.devices'),
      content: t('nav.content'),
      publications: t('nav.publications'),
      schedules: t('nav.schedules'),
      audit: t('nav.audit'),
      settings: t('nav.settings'),
    }),
    [t],
  );
  const actionLabels = useMemo(
    (): Record<string, string> => ({
      read: t('roles.action.read'),
      write: t('roles.action.write'),
      publish: t('roles.action.publish'),
      delete: t('roles.action.delete'),
      manage: t('roles.action.manage'),
      assign: t('roles.action.assign'),
      restore: t('roles.action.restore'),
      access: t('roles.action.access'),
    }),
    [t],
  );

  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [availablePermissions, setAvailablePermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [creatingRole, setCreatingRole] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<AdminRole | null>(null);
  const [deleting, setDeleting] = useState(false);

  const knownPermissions = useMemo(
    () => collectKnownPermissions(availablePermissions, ...roles.map((role) => role.permissions || [])),
    [availablePermissions, roles],
  );
  const permissionGroups = useMemo(
    () => buildPermissionGroups({
      permissions: knownPermissions,
      resourceLabels,
      actionLabels,
    }),
    [actionLabels, knownPermissions, resourceLabels],
  );

  const pageCount = Math.max(1, Math.ceil(roles.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pagedRoles = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return roles.slice(start, start + PAGE_SIZE);
  }, [currentPage, roles]);

  const load = useCallback(async () => {
    if (!canRead) {
      setRoles([]);
      setAvailablePermissions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const result = await listRoles();
      setRoles(result.data);
      setAvailablePermissions(result.available_permissions || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('roles.toast.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [canRead, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreateDialog = () => {
    setCreateName('');
    setCreateOpen(true);
  };

  const handleCreateRole = async () => {
    const trimmedName = createName.trim();
    if (!trimmedName) {
      toast.error(t('roles.toast.nameRequired'));
      return;
    }

    setCreatingRole(true);
    try {
      const role = await createRole({
        name: trimmedName,
        permissions: [],
      });
      toast.success(t('roles.toast.created'));
      setCreateOpen(false);
      setCreateName('');
      router.push(`/admin/roles/${role.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('roles.toast.createFailed'));
    } finally {
      setCreatingRole(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    if (!canDeleteRoles) {
      toast.error(t('roles.toast.deleteForbidden'));
      return;
    }

    setDeleting(true);
    try {
      await deleteRole(deleteTarget.id);
      toast.success(t('roles.toast.deleted'));
      setDeleteTarget(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('roles.toast.deleteFailed'));
    } finally {
      setDeleting(false);
    }
  };

  if (!canRead) {
    return (
      <div className="space-y-4">
        <PageHeader description={t('roles.description')} />
        <p className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {t('roles.noPermission')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader description={t('roles.description')} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => void load()}
            disabled={loading}
          >
            <RotateCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="sr-only">{t('roles.refresh')}</span>
          </Button>
        </div>

        {canWrite ? (
          <Button className="h-8 self-start sm:self-auto" onClick={openCreateDialog}>
            <Plus className="size-4" />
            {t('roles.newRole')}
          </Button>
        ) : null}
      </div>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) {
            setCreateName('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('roles.createRole')}</DialogTitle>
            <DialogDescription>{t('roles.createNameDescription')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="role-name">{t('roles.roleName')}</Label>
            <Input
              id="role-name"
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void handleCreateRole();
                }
              }}
              disabled={creatingRole}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creatingRole}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void handleCreateRole()} disabled={creatingRole}>
              {creatingRole ? t('roles.creating') : t('roles.createAndConfigure')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DataTable total={roles.length} page={currentPage} pageSize={PAGE_SIZE} onPageChange={setPage}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4 min-w-[180px]">{t('roles.tableRole')}</TableHead>
              {permissionGroups.map((group) => (
                <TableHead key={group.resource} className="min-w-[140px] whitespace-normal text-center">
                  <div className="flex flex-col items-center text-center">
                    <div className="font-medium">{group.resourceLabel}</div>
                    <div className="text-xs font-normal text-muted-foreground">
                      {t('roles.actionsAvailable', { count: group.permissions.length })}
                    </div>
                  </div>
                </TableHead>
              ))}
              {canWrite ? (
                <TableHead className="w-[52px] text-center">
                  <span className="sr-only">{t('roles.tableActions')}</span>
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={permissionGroups.length + (canWrite ? 2 : 1)} className="py-6 text-center text-sm text-muted-foreground">
                  {t('common.loading')}
                </TableCell>
              </TableRow>
            ) : pagedRoles.map((role) => {
              const lockedRole = isLockedRole(role);
              const wildcard = hasWildcardPermission(role.permissions || []);

              return (
                <TableRow key={role.id}>
                  <TableCell className="pl-4 align-top">
                    <div className="font-medium">{role.name}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {wildcard
                          ? t('roles.fullAccess')
                          : t('roles.selectedCount', { count: role.permissions.length })}
                      </span>
                      {lockedRole ? (
                        <Badge variant="outline" className="text-[11px]">
                          {t('roles.typeSystem')}
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>

                  {permissionGroups.map((group) => {
                    const granted = getGrantedPermissionsForGroup(role.permissions || [], group);

                    return (
                      <TableCell key={`${role.id}-${group.resource}`} className="align-middle text-center">
                        {wildcard ? (
                          <div className="flex justify-center">
                            <Badge variant="default" className="text-[11px]">
                              {t('roles.fullAccessShort')}
                            </Badge>
                          </div>
                        ) : granted.length ? (
                          <div className="flex flex-wrap justify-center gap-1">
                            {granted.map((permission) => (
                              <Badge
                                key={`${role.id}-${permission.permission}`}
                                variant="secondary"
                                className="text-[11px]"
                              >
                                {permission.actionLabel}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    );
                  })}

                  {canWrite ? (
                    <TableCell className="w-[52px] text-center">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="size-4" />
                            <span className="sr-only">{t('roles.tableActions')}</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-44">
                          <DropdownMenuItem onClick={() => router.push(`/admin/roles/${role.id}`)}>
                            <Shield className="size-4" />
                            {lockedRole ? t('roles.viewPermissions') : t('roles.editPermissions')}
                          </DropdownMenuItem>
                          {canDeleteRoles ? (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="destructive"
                                disabled={isSystemRole(role)}
                                onClick={() => {
                                  if (isSystemRole(role)) {
                                    return;
                                  }
                                  setDeleteTarget(role);
                                }}
                              >
                                <Trash2 className="size-4" />
                                {isSystemRole(role) ? t('roles.systemRoleLocked') : t('roles.deleteAction')}
                              </DropdownMenuItem>
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
            {!loading && roles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={permissionGroups.length + (canWrite ? 2 : 1)} className="py-8 text-center text-muted-foreground">
                  {t('roles.empty')}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </DataTable>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('roles.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('roles.deleteDescription', { name: deleteTarget?.name ?? '—' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()} disabled={deleting}>
              {deleting ? t('roles.deleting') : t('roles.deleteAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
