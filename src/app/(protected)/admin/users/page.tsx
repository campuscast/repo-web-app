'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Plus, Search, RotateCw, UserX, KeyRound, Shield,
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
  listUsers, createUser, updateUser, deactivateUser,
  adminResetPassword, listRoles, assignRole, removeRole,
} from '@/services/user-admin-service';
import type { AdminUser, AdminRole } from '@/types/api';

export default function UsersAdminPage() {
  const { isAdmin, hasPermission } = useAuthStore();
  const canWrite = isAdmin() || hasPermission('users.write');

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<AdminRole[]>([]);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ email: '', name: '', password: '', role_ids: [] as string[] });
  const [creating, setCreating] = useState(false);

  // Edit dialog
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', role_ids: [] as string[] });
  const [saving, setSaving] = useState(false);

  // Deactivate dialog
  const [deactivateTarget, setDeactivateTarget] = useState<AdminUser | null>(null);

  // Reset password dialog
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [usersResult, rolesResult] = await Promise.all([
        listUsers({ page, page_size: 20, search: search || undefined }),
        listRoles(),
      ]);
      setUsers(usersResult.data);
      setTotal(usersResult.pagination.total);
      setRoles(rolesResult.data);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!createForm.email || !createForm.password) {
      toast.error('Email and password are required');
      return;
    }
    setCreating(true);
    try {
      await createUser(createForm);
      toast.success('User created');
      setCreateOpen(false);
      setCreateForm({ email: '', name: '', password: '', role_ids: [] });
      load();
    } catch (e: any) {
      toast.error(e.message || 'Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  const handleEdit = async () => {
    if (!editUser) return;
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
    try {
      await deactivateUser(deactivateTarget.id);
      toast.success('User deactivated');
      setDeactivateTarget(null);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Failed to deactivate user');
    }
  };

  const handleResetPassword = async () => {
    if (!resetTarget) return;
    try {
      const result = await adminResetPassword(resetTarget.id);
      setTempPassword(result.temporary_password);
      toast.success('Password reset');
    } catch (e: any) {
      toast.error(e.message || 'Failed to reset password');
    }
  };

  const openEdit = (user: AdminUser) => {
    setEditUser(user);
    setEditForm({
      name: user.name || '',
      email: user.email,
      role_ids: user.roles.map(r => r.id),
    });
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
            {users.map((user) => (
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
                  {user.must_change_password && (
                    <Badge variant="outline" className="ml-1 text-xs">must change pwd</Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {user.created_at ? new Date(user.created_at).toLocaleDateString() : '-'}
                </TableCell>
                {canWrite && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(user)} title="Edit">
                        <Shield className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => { setResetTarget(user); setTempPassword(null); }} title="Reset password">
                        <KeyRound className="size-4" />
                      </Button>
                      {user.status === 'active' && (
                        <Button variant="ghost" size="icon" onClick={() => setDeactivateTarget(user)} title="Deactivate">
                          <UserX className="size-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
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
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={createForm.email} onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Password (min 8 chars)</Label>
              <Input type="password" value={createForm.password} onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))} />
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? 'Creating...' : 'Create'}
            </Button>
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
              <Label>Email</Label>
              <Input value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
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
