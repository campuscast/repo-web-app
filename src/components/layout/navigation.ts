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
};

export const APP_NAV_ITEMS: AppNavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/zones', label: 'Zones', icon: MapPinned },
  { href: '/screen-groups', label: 'Screen Groups', icon: Tv },
  { href: '/devices', label: 'Devices', icon: MonitorSmartphone },
  { href: '/content', label: 'Content', icon: FileVideo2 },
  { href: '/schedules', label: 'Schedules', icon: CalendarClock },
  { href: '/releases', label: 'Releases', icon: Rocket },
  { href: '/audit', label: 'Audit', icon: ScrollText },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/settings', label: 'Settings', icon: Settings },
];

const PATH_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/zones': 'Zones',
  '/screen-groups': 'Screen Groups',
  '/devices': 'Devices',
  '/content': 'Content',
  '/schedules': 'Schedules',
  '/releases': 'Releases',
  '/audit': 'Audit',
  '/admin/users': 'User Management',
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
