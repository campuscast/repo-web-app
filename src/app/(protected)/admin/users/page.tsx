'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Plus, Search, RotateCw, UserX, KeyRound, Shield, UserCheck, Trash2, Clipboard,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/common/page-header';
import { useAuthStore } from '@/auth/store';
import {
  listUsers, getUser, createUser, updateUser, deactivateUser,
  restoreUser, deleteUserPermanently, adminResetPassword, listRoles, assignRole, removeRole,
} from '@/services/user-admin-service';
import { zoneService } from '@/services/zone-service';
import type { AdminUser, AdminRole, Zone } from '@/types/api';

const MAX_USER_LOGIN_LENGTH = 20;
const MAX_USER_NAME_LENGTH = 20;

export default function UsersAdminPage() {
  const { isAdmin, hasPermission, user: currentUser } = useAuthStore();
  const canRead = isAdmin() || hasPermission('users.read');
  const canWrite = isAdmin() || hasPermission('users.write');
  const currentUserId = currentUser?.id ?? null;

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    email: '',
    name: '',
    role_ids: [] as string[],
    zone_ids: [] as string[],
  });
  const [creating, setCreating] = useState(false);
  const [createLoginLimitNotified, setCreateLoginLimitNotified] = useState(false);
  const [createNameLimitNotified, setCreateNameLimitNotified] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<{ login: string; temporary_password: string } | null>(null);

  // Edit dialog
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    role_ids: [] as string[],
    zone_ids: [] as string[],
  });
  const [saving, setSaving] = useState(false);
  const [editLoginLimitNotified, setEditLoginLimitNotified] = useState(false);
  const [editNameLimitNotified, setEditNameLimitNotified] = useState(false);

  // Deactivate dialog
  const [deactivateTarget, setDeactivateTarget] = useState<AdminUser | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<AdminUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);

  // Reset password dialog
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canRead) {
      setUsers([]);
      setRoles([]);
      setZones([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [usersResult, rolesResult, zonesResult] = await Promise.all([
        listUsers({ page, page_size: 20, search: search || undefined }),
        listRoles(),
        zoneService.listZones(),
      ]);
      setUsers(usersResult.data);
      setTotal(usersResult.pagination.total);
      setRoles(rolesResult.data);
      setZones(zonesResult);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [canRead, page, search]);

  useEffect(() => { load(); }, [load]);

  if (!canRead) {
    return (
      <div className="space-y-4">
        <PageHeader description="Manage system users, roles, and permissions" />
        <p className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          You do not have permission to view users.
        </p>
      </div>
    );
  }

  const enforceLength = (
    rawValue: string,
    maxLength: number,
    fieldLabel: string,
    limitNotified: boolean,
    setLimitNotified: (value: boolean) => void,
  ) => {
    if (rawValue.length <= maxLength) {
      if (limitNotified) setLimitNotified(false);
      return rawValue;
    }

    if (!limitNotified) {
      toast.error(`${fieldLabel} cannot be longer than ${maxLength} characters`);
      setLimitNotified(true);
    }
    return rawValue.slice(0, maxLength);
  };

  const isSuperAdminUser = (user: AdminUser | null | undefined) =>
    Boolean(user?.roles.some((role) => role.name === 'super_admin'));

  const handleCreate = async () => {
    if (!createForm.email.trim()) {
      toast.error('Login is required');
      return;
    }
    setCreating(true);
    try {
      const created = await createUser(createForm);
      toast.success('User created');
      setCreateOpen(false);
      setCreateForm({ email: '', name: '', role_ids: [], zone_ids: [] });
      setCreateLoginLimitNotified(false);
      setCreateNameLimitNotified(false);
      setCreatedCredentials({
        login: created.email,
        temporary_password: created.temporary_password || 'not available',
      });
      load();
    } catch (e: any) {
      toast.error(e.message || 'Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  const handleEdit = async () => {
    if (!editUser) return;
    if (isSuperAdminUser(editUser)) {
      toast.error('super_admin user cannot be modified in Users');
      setEditUser(null);
      return;
    }
    setSaving(true);
    try {
      await updateUser(editUser.id, editForm);
      toast.success('User updated');
      setEditUser(null);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Failed to update user');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    if (!deactivateTarget) return;
    if (isSuperAdminUser(deactivateTarget)) {
      toast.error('super_admin user cannot be deactivated');
      setDeactivateTarget(null);
      return;
    }
    if (deactivateTarget.id === currentUserId) {
      toast.error('You cannot deactivate your own account');
      setDeactivateTarget(null);
      return;
    }
    try {
      await deactivateUser(deactivateTarget.id);
      toast.success('User deactivated');
      setDeactivateTarget(null);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Failed to deactivate user');
    }
  };

  const handleRestore = async () => {
    if (!restoreTarget) return;
    if (isSuperAdminUser(restoreTarget)) {
      toast.error('super_admin user cannot be modified in Users');
      setRestoreTarget(null);
      return;
    }
    try {
      await restoreUser(restoreTarget.id);
      toast.success('User restored');
      setRestoreTarget(null);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Failed to restore user');
    }
  };

  const handleDeletePermanently = async () => {
    if (!deleteTarget) return;
    if (isSuperAdminUser(deleteTarget)) {
      toast.error('super_admin user cannot be deleted');
      setDeleteTarget(null);
      return;
    }
    if (deleteTarget.id === currentUserId) {
      toast.error('You cannot delete your own account');
      setDeleteTarget(null);
      return;
    }
    try {
      await deleteUserPermanently(deleteTarget.id);
      toast.success('User deleted permanently');
      setDeleteTarget(null);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete user');
    }
  };

  const handleResetPassword = async () => {
    if (!resetTarget) return;
    if (isSuperAdminUser(resetTarget)) {
      toast.error('super_admin password can only be changed in personal profile');
      setResetTarget(null);
      return;
    }
    try {
      const result = await adminResetPassword(resetTarget.id);
      setTempPassword(result.temporary_password);
      toast.success('Password reset');
    } catch (e: any) {
      toast.error(e.message || 'Failed to reset password');
    }
  };

  const openEdit = async (user: AdminUser) => {
    if (isSuperAdminUser(user)) {
      toast.error('super_admin user cannot be modified in Users');
      return;
    }
    setEditUser(user);
    setEditLoginLimitNotified(false);
    setEditNameLimitNotified(false);
    setEditForm({
      name: user.name || '',
      email: user.email,
      role_ids: user.roles.map(r => r.id),
      zone_ids: [],
    });

    try {
      const details = await getUser(user.id);
      setEditForm({
        name: details.name || '',
        email: details.email,
        role_ids: details.roles.map((role) => role.id),
        zone_ids: details.zones.map((zone) => zone.zone_id),
      });
    } catch {
      // keep base form state if details endpoint fails
    }
  };

  const toggleRole = (roleId: string, current: string[], setter: (ids: string[]) => void) => {
    if (current.includes(roleId)) {
      setter(current.filter(id => id !== roleId));
    } else {
      setter([...current, roleId]);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        description="Manage system users, roles, and permissions"
        actions={
          canWrite ? (
            <Button onClick={() => setCreateOpen(true)} size="sm">
              <Plus className="mr-1.5 size-4" />
              Create User
            </Button>
          ) : null
        }
      />

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by email or name..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Button variant="outline" size="icon" onClick={load} disabled={loading}>
          <RotateCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              {canWrite && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => {
              const isProtectedSuperAdmin = isSuperAdminUser(user);

              return (
              <TableRow key={user.id}>
                <TableCell>
                  <div className="font-medium">{user.name || user.email}</div>
                  <div className="text-xs text-muted-foreground">{user.email}</div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {user.roles.map((role) => (
                      <Badge key={role.id} variant="secondary" className="text-xs">
                        {role.name}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={user.status === 'active' ? 'default' : 'destructive'}>
                    {user.status}
                  </Badge>
                  <Badge
                    variant={user.online ? 'default' : 'outline'}
                    className="ml-1 text-xs"
                  >
                    {user.online ? 'online' : 'offline'}
                  </Badge>
                  {user.must_change_password && (
                    <Badge variant="outline" className="ml-1 text-xs">must change pwd</Badge>
                  )}
                  {isProtectedSuperAdmin && (
                    <Badge variant="outline" className="ml-1 text-xs">protected</Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {user.created_at ? new Date(user.created_at).toLocaleDateString() : '-'}
                </TableCell>
                {canWrite && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {!isProtectedSuperAdmin ? (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => { void openEdit(user); }} title="Edit">
                            <Shield className="size-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => { setResetTarget(user); setTempPassword(null); }} title="Reset password">
                            <KeyRound className="size-4" />
                          </Button>
                          {user.status === 'active' && user.id !== currentUserId && (
                            <Button variant="ghost" size="icon" onClick={() => setDeactivateTarget(user)} title="Deactivate">
                              <UserX className="size-4" />
                            </Button>
                          )}
                          {user.status !== 'active' && user.id !== currentUserId && (
                            <Button variant="ghost" size="icon" onClick={() => setRestoreTarget(user)} title="Restore">
                              <UserCheck className="size-4" />
                            </Button>
                          )}
                          {user.id !== currentUserId && (
                            <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(user)} title="Delete permanently">
                              <Trash2 className="size-4" />
                            </Button>
                          )}
                        </>
                      ) : null}
                    </div>
                  </TableCell>
                )}
              </TableRow>
              );
            })}
            {!loading && users.length === 0 && (
              <TableRow>
                <TableCell colSpan={canWrite ? 5 : 4} className="text-center py-8 text-muted-foreground">
                  No users found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {total > 20 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Page {page} of {Math.ceil(total / 20)}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Create User Dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) {
            setCreateForm({ email: '', name: '', role_ids: [], zone_ids: [] });
            setCreateLoginLimitNotified(false);
            setCreateNameLimitNotified(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Login</Label>
              <Input
                value={createForm.email}
                onChange={(e) => {
                  const next = enforceLength(
                    e.target.value,
                    MAX_USER_LOGIN_LENGTH,
                    'Login',
                    createLoginLimitNotified,
                    setCreateLoginLimitNotified,
                  );
                  setCreateForm((f) => ({ ...f, email: next }));
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={createForm.name}
                onChange={(e) => {
                  const next = enforceLength(
                    e.target.value,
                    MAX_USER_NAME_LENGTH,
                    'Name',
                    createNameLimitNotified,
                    setCreateNameLimitNotified,
                  );
                  setCreateForm((f) => ({ ...f, name: next }));
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Roles</Label>
              <div className="flex flex-wrap gap-2">
                {roles.map((role) => (
                  <Badge
                    key={role.id}
                    variant={createForm.role_ids.includes(role.id) ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => toggleRole(role.id, createForm.role_ids, ids => setCreateForm(f => ({ ...f, role_ids: ids })))}
                  >
                    {role.name}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Zone assignments</Label>
              <div className="flex flex-wrap gap-2">
                {zones.map((zone) => (
                  <Badge
                    key={zone.zone_id}
                    variant={createForm.zone_ids.includes(zone.zone_id) ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => toggleRole(zone.zone_id, createForm.zone_ids, ids => setCreateForm(f => ({ ...f, zone_ids: ids })))}
                  >
                    {zone.name}
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

      <Dialog open={!!createdCredentials} onOpenChange={(open) => !open && setCreatedCredentials(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>User created</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Login</Label>
              <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
                <code className="flex-1 text-sm">{createdCredentials?.login}</code>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={async () => {
                    if (!createdCredentials?.login) return;
                    await navigator.clipboard.writeText(createdCredentials.login);
                    toast.success('Login copied');
                  }}
                >
                  <Clipboard className="size-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Temporary password</Label>
              <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
                <code className="flex-1 text-sm">{createdCredentials?.temporary_password}</code>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={async () => {
                    if (!createdCredentials?.temporary_password) return;
                    await navigator.clipboard.writeText(createdCredentials.temporary_password);
                    toast.success('Temporary password copied');
                  }}
                >
                  <Clipboard className="size-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Save and transfer these credentials securely. The temporary password will not be shown again.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setCreatedCredentials(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Login</Label>
              <Input
                value={editForm.email}
                onChange={(e) => {
                  const next = enforceLength(
                    e.target.value,
                    MAX_USER_LOGIN_LENGTH,
                    'Login',
                    editLoginLimitNotified,
                    setEditLoginLimitNotified,
                  );
                  setEditForm((f) => ({ ...f, email: next }));
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={editForm.name}
                onChange={(e) => {
                  const next = enforceLength(
                    e.target.value,
                    MAX_USER_NAME_LENGTH,
                    'Name',
                    editNameLimitNotified,
                    setEditNameLimitNotified,
                  );
                  setEditForm((f) => ({ ...f, name: next }));
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Roles</Label>
              <div className="flex flex-wrap gap-2">
                {roles.map((role) => (
                  <Badge
                    key={role.id}
                    variant={editForm.role_ids.includes(role.id) ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => toggleRole(role.id, editForm.role_ids, ids => setEditForm(f => ({ ...f, role_ids: ids })))}
                  >
                    {role.name}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Zone assignments</Label>
              <div className="flex flex-wrap gap-2">
                {zones.map((zone) => (
                  <Badge
                    key={zone.zone_id}
                    variant={editForm.zone_ids.includes(zone.zone_id) ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => toggleRole(zone.zone_id, editForm.zone_ids, ids => setEditForm(f => ({ ...f, zone_ids: ids })))}
                  >
                    {zone.name}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate Confirm */}
      <AlertDialog open={!!deactivateTarget} onOpenChange={(open) => !open && setDeactivateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to deactivate {deactivateTarget?.email}? They will no longer be able to log in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeactivate}>Deactivate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!restoreTarget} onOpenChange={(open) => !open && setRestoreTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore User</AlertDialogTitle>
            <AlertDialogDescription>
              Restore {restoreTarget?.email}? The user will be able to log in again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestore}>Restore</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User Permanently</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete {deleteTarget?.email}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeletePermanently}>Delete permanently</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Password Dialog */}
      <Dialog open={!!resetTarget} onOpenChange={(open) => { if (!open) { setResetTarget(null); setTempPassword(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
          </DialogHeader>
          {!tempPassword ? (
            <div>
              <p className="text-sm text-muted-foreground mb-4">
                Generate a temporary password for <strong>{resetTarget?.email}</strong>.
                The user will be required to change it on next login.
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setResetTarget(null)}>Cancel</Button>
                <Button onClick={handleResetPassword}>Generate Password</Button>
              </DialogFooter>
            </div>
          ) : (
            <div>
              <p className="text-sm text-muted-foreground mb-2">
                Temporary password for <strong>{resetTarget?.email}</strong>:
              </p>
              <code className="block p-3 bg-muted rounded text-sm font-mono select-all">
                {tempPassword}
              </code>
              <p className="text-xs text-muted-foreground mt-2">
                Copy this password and share it securely. It will not be shown again.
              </p>
              <DialogFooter className="mt-4">
                <Button onClick={() => { setResetTarget(null); setTempPassword(null); }}>Done</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
