export function hasRole(roles: string[], role: string) {
  if (role === 'admin') {
    return roles.includes('admin') || roles.includes('super_admin');
  }
  return roles.includes(role);
}

export function canAccessZone(userZones: string[], zoneId: string) {
  if (!zoneId) {
    return false;
  }

  return userZones.includes(zoneId);
}

export function filterAllowedZones<T extends { zone_id: string }>(items: T[], userZones: string[]) {
  return items.filter((item) => userZones.includes(item.zone_id));
}
