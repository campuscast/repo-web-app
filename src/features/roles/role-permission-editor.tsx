'use client';

import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, RefreshCw, Save, Shield } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuthStore } from '@/auth/store';
import { EmptyState } from '@/components/common/empty-state';
import { PageHeader } from '@/components/common/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLocale } from '@/hooks/use-locale';
import { getRole, listRoles, updateRole } from '@/services/user-admin-service';
import type { AdminRole } from '@/types/api';
import {
  buildActionColumns,
  buildPermissionGroups,
  collectKnownPermissions,
  countCoveredResources,
  hasWildcardPermission,
  isLockedRole,
} from './role-permissions';

type RolePermissionEditorProps = {
  roleId: string;
};

type RoleFormState = {
  name: string;
  permissions: string[];
};

function StatCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-xl border bg-card/70 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
    </div>
  );
}

function serializePermissions(permissions: string[]) {
  return [...permissions.filter((permission) => permission !== '*')].sort().join('|');
}

export function RolePermissionEditor({ roleId }: RolePermissionEditorProps) {
  const router = useRouter();
  const { t } = useLocale();
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const canRead = isAdmin() || hasPermission('users.read');
  const canWrite = isAdmin() || hasPermission('users.write');
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

  const [role, setRole] = useState<AdminRole | null>(null);
  const [availablePermissions, setAvailablePermissions] = useState<string[]>([]);
  const [form, setForm] = useState<RoleFormState>({ name: '', permissions: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const knownPermissions = useMemo(
    () => collectKnownPermissions(availablePermissions, role?.permissions, form.permissions),
    [availablePermissions, form.permissions, role?.permissions],
  );
  const permissionGroups = useMemo(
    () => buildPermissionGroups({
      permissions: knownPermissions,
      resourceLabels,
      actionLabels,
    }),
    [actionLabels, knownPermissions, resourceLabels],
  );
  const actionColumns = useMemo(
    () => buildActionColumns(permissionGroups, actionLabels),
    [actionLabels, permissionGroups],
  );

  const lockedSystemRole = Boolean(role && isLockedRole(role));
  const readOnlyEditor = !canWrite || lockedSystemRole;
  const selectedPermissionCount = useMemo(() => {
    if (hasWildcardPermission(form.permissions)) {
      return knownPermissions.length;
    }

    return form.permissions.filter((permission) => permission !== '*').length;
  }, [form.permissions, knownPermissions.length]);
  const selectedResourceCount = useMemo(
    () => countCoveredResources(permissionGroups, form.permissions),
    [form.permissions, permissionGroups],
  );
  const hasChanges = useMemo(() => {
    if (!role) {
      return false;
    }

    return role.name !== form.name.trim()
      || serializePermissions(role.permissions || []) !== serializePermissions(form.permissions);
  }, [form.name, form.permissions, role]);
  const matrixGridStyle = useMemo<CSSProperties>(
    () => ({
      gridTemplateColumns: `minmax(220px, 1.5fr) repeat(${Math.max(actionColumns.length, 1)}, minmax(96px, 1fr))`,
    }),
    [actionColumns.length],
  );
  const matrixMinWidth = useMemo(
    () => 220 + Math.max(actionColumns.length, 1) * 96 + Math.max(actionColumns.length, 1) * 12,
    [actionColumns.length],
  );

  const load = useCallback(async () => {
    if (!canRead) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [roleResult, rolesResult] = await Promise.all([
        getRole(roleId),
        listRoles(),
      ]);

      setRole(roleResult);
      setAvailablePermissions(rolesResult.available_permissions || []);
      setForm({
        name: roleResult.name,
        permissions: roleResult.permissions || [],
      });
    } catch (error) {
      setRole(null);
      toast.error(error instanceof Error ? error.message : t('roles.toast.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [canRead, roleId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const togglePermission = (permission: string) => {
    if (readOnlyEditor) {
      return;
    }

    setForm((current) => {
      if (current.permissions.includes(permission)) {
        return {
          ...current,
          permissions: current.permissions.filter((value) => value !== permission),
        };
      }

      return {
        ...current,
        permissions: [...current.permissions.filter((value) => value !== '*'), permission],
      };
    });
  };

  const saveRole = async () => {
    if (!role || readOnlyEditor) {
      return;
    }

    const trimmedName = form.name.trim();
    if (!trimmedName) {
      toast.error(t('roles.toast.nameRequired'));
      return;
    }

    setSaving(true);
    try {
      const updatedRole = await updateRole(role.id, {
        name: trimmedName,
        permissions: form.permissions.filter((permission) => permission !== '*'),
      });

      setRole(updatedRole);
      setForm({
        name: updatedRole.name,
        permissions: updatedRole.permissions || [],
      });
      toast.success(t('roles.toast.updated'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('roles.toast.updateFailed'));
    } finally {
      setSaving(false);
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

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border bg-card px-4 py-3">
          <div className="text-sm text-muted-foreground">{t('common.loading')}</div>
        </div>
      </div>
    );
  }

  if (!role) {
    return (
      <div className="space-y-4">
        <Button variant="outline" size="sm" onClick={() => router.push('/admin/roles')}>
          <ArrowLeft className="size-4" />
          {t('roles.backToRoles')}
        </Button>
        <EmptyState
          icon={<Shield className="size-8" />}
          title={t('roles.notFoundTitle')}
          description={t('roles.notFoundDescription')}
          actionLabel={t('roles.openRoles')}
          onAction={() => router.push('/admin/roles')}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card px-4 py-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="ghost" size="icon-sm" onClick={() => router.push('/admin/roles')} aria-label={t('roles.backToRoles')}>
              <ArrowLeft className="size-4" />
            </Button>

            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
              <Badge variant="outline" className="w-fit shrink-0">
                {lockedSystemRole ? t('roles.typeSystem') : t('roles.typeCustom')}
              </Badge>
              <Input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                disabled={readOnlyEditor}
                className="h-9 min-w-0 max-w-[560px] text-base font-semibold tracking-tight"
                aria-label={t('roles.roleName')}
                placeholder={t('roles.roleName')}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading || saving}>
              <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
              {t('roles.refresh')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => router.push('/admin/roles')}>
              {t('common.cancel')}
            </Button>
            {!readOnlyEditor ? (
              <Button size="sm" className="min-w-[152px]" onClick={() => void saveRole()} disabled={saving || !hasChanges}>
                <Save className="size-4" />
                {saving ? t('roles.saving') : t('roles.saveChanges')}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <PageHeader
        description={readOnlyEditor ? t('roles.readonlyDescription') : t('roles.editorDescription')}
      />

      <div className="grid gap-3 md:grid-cols-3">
        <StatCard
          label={t('roles.permissionMatrix')}
          value={String(selectedPermissionCount)}
          helper={t('roles.selectedCount', { count: selectedPermissionCount })}
        />
        <StatCard
          label={t('roles.resourcesCovered')}
          value={String(selectedResourceCount)}
          helper={t('roles.resourcesCount', { count: selectedResourceCount })}
        />
        <StatCard
          label={t('roles.roleType')}
          value={lockedSystemRole ? t('roles.typeSystem') : t('roles.typeCustom')}
          helper={readOnlyEditor ? t('roles.readonlyDescription') : t('roles.permissionMatrixHint')}
        />
      </div>

      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium">{t('roles.permissionMatrix')}</h2>
            <p className="text-xs text-muted-foreground">{t('roles.permissionMatrixHint')}</p>
          </div>
          {readOnlyEditor ? (
            <Badge variant="outline">{t('roles.readonlyBadge')}</Badge>
          ) : null}
        </div>

        {permissionGroups.length ? (
          <div className="overflow-x-auto rounded-xl border">
            <div className="min-w-full" style={{ minWidth: `${matrixMinWidth}px` }}>
              <div
                className="grid items-center gap-3 border-b bg-muted/50 px-4 py-3 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground"
                style={matrixGridStyle}
              >
                <div>{t('roles.tablePermissions')}</div>
                {actionColumns.map((column) => (
                  <div key={column.action} className="text-center">
                    {column.label}
                  </div>
                ))}
              </div>

              {permissionGroups.map((group) => (
                <div
                  key={group.resource}
                  className="grid items-center gap-3 border-b px-4 py-3 last:border-b-0"
                  style={matrixGridStyle}
                >
                  <div>
                    <div className="font-medium">{group.resourceLabel}</div>
                    <div className="text-xs text-muted-foreground">
                      {t('roles.actionsAvailable', { count: group.permissions.length })}
                    </div>
                  </div>

                  {actionColumns.map((column) => {
                    const permission = group.permissionByAction[column.action];

                    if (!permission) {
                      return (
                        <div key={`${group.resource}-${column.action}`} className="flex justify-center text-muted-foreground">
                          —
                        </div>
                      );
                    }

                    const checked =
                      hasWildcardPermission(form.permissions)
                      || form.permissions.includes(permission);

                    return (
                      <div key={`${group.resource}-${permission}`} className="flex justify-center">
                        <label
                          className={`flex h-10 w-10 items-center justify-center rounded-lg border transition ${
                            checked
                              ? 'border-primary/40 bg-primary/10'
                              : 'border-border bg-background hover:bg-muted/50'
                          } ${readOnlyEditor ? 'cursor-default opacity-70' : 'cursor-pointer'}`}
                        >
                          <input
                            type="checkbox"
                            className="size-4 accent-primary"
                            checked={checked}
                            disabled={readOnlyEditor || hasWildcardPermission(form.permissions)}
                            onChange={() => togglePermission(permission)}
                          />
                        </label>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            {t('roles.noPermissionsConfigured')}
          </div>
        )}
      </div>
    </div>
  );
}
