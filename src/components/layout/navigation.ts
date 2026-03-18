import {
  LayoutDashboard,
  MapPinned,
  Tv,
  MonitorSmartphone,
  FileVideo2,
  CalendarClock,
  Rocket,
  ScrollText,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';

export type AppNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  requiredPermission?: string;
  adminOnly?: boolean;
};

export const APP_NAV_ITEMS: AppNavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/zones', label: 'Zones', icon: MapPinned, requiredPermission: 'zones.read' },
  { href: '/screen-groups', label: 'Screen Groups', icon: Tv, requiredPermission: 'zones.read' },
  { href: '/devices', label: 'Devices', icon: MonitorSmartphone, requiredPermission: 'devices.read' },
  { href: '/content', label: 'Content', icon: FileVideo2, requiredPermission: 'content.read' },
  { href: '/publications', label: 'Publications', icon: FileVideo2, requiredPermission: 'content.read' },
  { href: '/schedules', label: 'Schedules', icon: CalendarClock, requiredPermission: 'schedules.read' },
  { href: '/releases', label: 'Releases', icon: Rocket, requiredPermission: 'schedules.read' },
  { href: '/audit', label: 'Audit', icon: ScrollText, requiredPermission: 'audit.read' },
  { href: '/admin/users', label: 'Users', icon: Users, requiredPermission: 'users.read' },
  { href: '/admin/roles', label: 'Roles', icon: Users, requiredPermission: 'users.read' },
  { href: '/settings', label: 'Settings', icon: Settings },
];

const PATH_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/zones': 'Zones',
  '/screen-groups': 'Screen Groups',
  '/devices': 'Devices',
  '/content': 'Content',
  '/publications': 'Publications',
  '/schedules': 'Schedules',
  '/releases': 'Releases',
  '/audit': 'Audit',
  '/admin/users': 'User Management',
  '/admin/roles': 'Role Management',
  '/settings': 'Settings',
};

export function getPathTitle(pathname: string) {
  if (pathname.startsWith('/schedules/')) {
    return 'Schedule Editor';
  }

  if (pathname.startsWith('/devices/')) {
    return 'Player Details';
  }

  const direct = PATH_TITLES[pathname];
  if (direct) return direct;

  const prefix = Object.keys(PATH_TITLES).find((key) =>
    pathname.startsWith(`${key}/`),
  );
  return prefix ? PATH_TITLES[prefix] : 'CampusCast';
}
