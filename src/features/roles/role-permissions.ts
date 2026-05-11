'use client';

import type { AdminRole } from '@/types/api';

export type PermissionOption = {
  permission: string;
  action: string;
  actionLabel: string;
};

export type PermissionGroup = {
  resource: string;
  resourceLabel: string;
  permissions: PermissionOption[];
  permissionByAction: Record<string, string>;
};

export type PermissionActionColumn = {
  action: string;
  label: string;
};

export const RESOURCE_ORDER = [
  'users',
  'roles',
  'zones',
  'devices',
  'content',
  'publications',
  'schedules',
  'audit',
  'settings',
];

export const ACTION_ORDER = [
  'read',
  'write',
  'publish',
  'delete',
  'manage',
  'assign',
  'restore',
];

export function formatPermissionTokenLabel(value: string): string {
  return value
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function parsePermission(permission: string): { resource: string; action: string } {
  const [resource, ...actionParts] = permission.split('.');
  return {
    resource: resource || 'other',
    action: actionParts.join('.') || 'access',
  };
}

export function hasWildcardPermission(permissions: string[] = []): boolean {
  return permissions.includes('*');
}

export function isSystemRole(role: Pick<AdminRole, 'name'> | { name: string }): boolean {
  return role.name === 'admin' || role.name === 'super_admin';
}

export function isLockedRole(role: Pick<AdminRole, 'name' | 'permissions'>): boolean {
  return isSystemRole(role) || hasWildcardPermission(role.permissions || []);
}

export function collectKnownPermissions(
  availablePermissions: string[] = [],
  ...permissionSets: Array<string[] | undefined>
): string[] {
  const permissions = new Set<string>();

  for (const permission of availablePermissions) {
    if (permission !== '*') {
      permissions.add(permission);
    }
  }

  for (const permissionSet of permissionSets) {
    for (const permission of permissionSet || []) {
      if (permission !== '*') {
        permissions.add(permission);
      }
    }
  }

  return Array.from(permissions);
}

export function buildPermissionGroups(params: {
  permissions: string[];
  resourceLabels: Record<string, string>;
  actionLabels: Record<string, string>;
}): PermissionGroup[] {
  const groups = new Map<string, PermissionGroup>();

  for (const permission of params.permissions) {
    const { resource, action } = parsePermission(permission);
    const current: PermissionGroup = groups.get(resource) ?? {
      resource,
      resourceLabel: params.resourceLabels[resource] ?? formatPermissionTokenLabel(resource),
      permissions: [],
      permissionByAction: {},
    };

    current.permissions.push({
      permission,
      action,
      actionLabel: params.actionLabels[action] ?? formatPermissionTokenLabel(action),
    });
    current.permissionByAction[action] = permission;
    groups.set(resource, current);
  }

  return Array.from(groups.values())
    .sort((left, right) => {
      const leftIndex = RESOURCE_ORDER.indexOf(left.resource);
      const rightIndex = RESOURCE_ORDER.indexOf(right.resource);
      const normalizedLeft = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
      const normalizedRight = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;

      if (normalizedLeft !== normalizedRight) {
        return normalizedLeft - normalizedRight;
      }

      return left.resourceLabel.localeCompare(right.resourceLabel);
    })
    .map((group) => ({
      ...group,
      permissions: [...group.permissions].sort((left, right) => {
        const leftIndex = ACTION_ORDER.indexOf(left.action);
        const rightIndex = ACTION_ORDER.indexOf(right.action);
        const normalizedLeft = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
        const normalizedRight = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;

        if (normalizedLeft !== normalizedRight) {
          return normalizedLeft - normalizedRight;
        }

        return left.actionLabel.localeCompare(right.actionLabel);
      }),
    }));
}

export function buildActionColumns(
  permissionGroups: PermissionGroup[],
  actionLabels: Record<string, string>,
): PermissionActionColumn[] {
  const actions = new Set<string>();

  for (const group of permissionGroups) {
    for (const permission of group.permissions) {
      actions.add(permission.action);
    }
  }

  return Array.from(actions)
    .sort((left, right) => {
      const leftIndex = ACTION_ORDER.indexOf(left);
      const rightIndex = ACTION_ORDER.indexOf(right);
      const normalizedLeft = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
      const normalizedRight = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;

      if (normalizedLeft !== normalizedRight) {
        return normalizedLeft - normalizedRight;
      }

      return (actionLabels[left] ?? formatPermissionTokenLabel(left)).localeCompare(
        actionLabels[right] ?? formatPermissionTokenLabel(right),
      );
    })
    .map((action) => ({
      action,
      label: actionLabels[action] ?? formatPermissionTokenLabel(action),
    }));
}

export function getGrantedPermissionsForGroup(
  permissions: string[] = [],
  group: PermissionGroup,
): PermissionOption[] {
  if (hasWildcardPermission(permissions)) {
    return group.permissions;
  }

  return group.permissions.filter((permission) => permissions.includes(permission.permission));
}

export function countCoveredResources(
  permissionGroups: PermissionGroup[],
  permissions: string[] = [],
): number {
  if (hasWildcardPermission(permissions)) {
    return permissionGroups.length;
  }

  return permissionGroups.filter((group) =>
    group.permissions.some((permission) => permissions.includes(permission.permission)),
  ).length;
}
