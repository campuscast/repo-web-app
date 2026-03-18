'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RotateCw, Shield, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { useAuthStore } from '@/auth/store';
import { listRoles, createRole, updateRole, deleteRole } from '@/services/user-admin-service';
import type { AdminRole } from '@/types/api';

type RoleFormState = {
  name: string;
  permissions: string[];
};

const EMPTY_FORM: RoleFormState = {
  name: '',
  permissions: [],
};

export default function RolesAdminPage() {
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const canRead = isAdmin() || hasPermission('users.read');
  const canWrite = isAdmin() || hasPermission('users.write');
  const canDeleteRoles = isAdmin();

  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [availablePermissions, setAvailablePermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<RoleFormState>(EMPTY_FORM);

  const [editTarget, setEditTarget] = useState<AdminRole | null>(null);
  const [editForm, setEditForm] = useState<RoleFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminRole | null>(null);
  const [deleting, setDeleting] = useState(false);

  const sortedPermissions = useMemo(
    () => [...availablePermissions].sort((a, b) => a.localeCompare(b)),
    [availablePermissions],
  );

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
      toast.error(error instanceof Error ? error.message : 'Failed to load roles');
    } finally {
      setLoading(false);
    }
  }, [canRead]);

  useEffect(() => {
    void load();
  }, [load]);

  const togglePermission = (
    permission: string,
    current: string[],
    setter: (next: string[]) => void,
  ) => {
    if (current.includes(permission)) {
      setter(current.filter((p) => p !== permission));
      return;
    }
    setter([...current, permission]);
  };

  const handleCreate = async () => {
    if (!createForm.name.trim()) {
      toast.error('Role name is required');
      return;
    }

    setCreating(true);
    try {
      await createRole({
        name: createForm.name.trim(),
        permissions: createForm.permissions,
      });
      toast.success('Role created');
      setCreateOpen(false);
      setCreateForm(EMPTY_FORM);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create role');
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (role: AdminRole) => {
    setEditTarget(role);
    setEditForm({
      name: role.name,
      permissions: role.permissions || [],
    });
  };

  const handleSave = async () => {
    if (!editTarget) return;
    if (!editForm.name.trim()) {
      toast.error('Role name is required');
      return;
    }

    setSaving(true);
    try {
      await updateRole(editTarget.id, {
        name: editForm.name.trim(),
        permissions: editForm.permissions,
      });
      toast.success('Role updated');
      setEditTarget(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update role');
    } finally {
      setSaving(false);
    }
  };

  const isSystemRole = (role: AdminRole) => role.name === 'admin' || role.name === 'super_admin';

  const handleDelete = async () => {
    if (!deleteTarget) return;
    if (!canDeleteRoles) {
      toast.error('Only admin or super_admin can delete roles');
      return;
    }

    setDeleting(true);
    try {
      await deleteRole(deleteTarget.id);
      toast.success('Role deleted');
      setDeleteTarget(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete role');
    } finally {
      setDeleting(false);
    }
  };

  if (!canRead) {
    return (
      <div className="space-y-4">
        <PageHeader description="Role and permission management" />
        <p className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          You do not have permission to view roles.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        description="Create roles and manage permission bundles"
        actions={
          canWrite ? (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 size-4" />
              Create Role
            </Button>
          ) : null
        }
      />

      <div className="flex justify-end">
        <Button variant="outline" size="icon" onClick={() => void load()} disabled={loading}>
          <RotateCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Role</TableHead>
              <TableHead>Permissions</TableHead>
              {canWrite && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.map((role) => (
              <TableRow key={role.id}>
                <TableCell>
                  <div className="font-medium">{role.name}</div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {(role.permissions || []).map((permission) => (
                      <Badge key={`${role.id}-${permission}`} variant="secondary" className="text-xs">
                        {permission}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                {canWrite ? (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Edit role"
                        onClick={() => openEdit(role)}
                      >
                        <Shield className="size-4" />
                      </Button>
                      {canDeleteRoles ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          title={isSystemRole(role) ? 'System role cannot be deleted' : 'Delete role'}
                          onClick={() => {
                            if (isSystemRole(role)) return;
                            setDeleteTarget(role);
                          }}
                          disabled={isSystemRole(role)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
            {!loading && roles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canWrite ? 3 : 2} className="py-8 text-center text-muted-foreground">
                  No roles found
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Role</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Role name</Label>
              <Input
                value={createForm.name}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Permissions</Label>
              <div className="flex flex-wrap gap-2">
                {sortedPermissions.map((permission) => (
                  <Badge
                    key={`create-${permission}`}
                    variant={createForm.permissions.includes(permission) ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => togglePermission(permission, createForm.permissions, (next) => {
                      setCreateForm((prev) => ({ ...prev, permissions: next }));
                    })}
                  >
                    {permission}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editTarget)} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Role</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Role name</Label>
              <Input
                value={editForm.name}
                onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Permissions</Label>
              <div className="flex flex-wrap gap-2">
                {sortedPermissions.map((permission) => (
                  <Badge
                    key={`edit-${permission}`}
                    variant={editForm.permissions.includes(permission) ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => togglePermission(permission, editForm.permissions, (next) => {
                      setEditForm((prev) => ({ ...prev, permissions: next }));
                    })}
                  >
                    {permission}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Role</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete role <strong>{deleteTarget?.name}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete role'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
