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
  labelKey: string;
  icon: LucideIcon;
  requiredPermission?: string;
  adminOnly?: boolean;
};

export const APP_NAV_ITEMS: AppNavItem[] = [
  { href: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { href: '/zones', labelKey: 'nav.zones', icon: MapPinned, requiredPermission: 'zones.read' },
  { href: '/screen-groups', labelKey: 'nav.screenGroups', icon: Tv, requiredPermission: 'zones.read' },
  { href: '/devices', labelKey: 'nav.devices', icon: MonitorSmartphone, requiredPermission: 'devices.read' },
  { href: '/content', labelKey: 'nav.content', icon: FileVideo2, requiredPermission: 'content.read' },
  { href: '/publications', labelKey: 'nav.publications', icon: FileVideo2, requiredPermission: 'content.read' },
  { href: '/schedules', labelKey: 'nav.schedules', icon: CalendarClock, requiredPermission: 'schedules.read' },
  { href: '/releases', labelKey: 'nav.releases', icon: Rocket, requiredPermission: 'schedules.read' },
  { href: '/audit', labelKey: 'nav.audit', icon: ScrollText, requiredPermission: 'audit.read' },
  { href: '/admin/users', labelKey: 'nav.users', icon: Users, requiredPermission: 'users.read' },
  { href: '/admin/roles', labelKey: 'nav.roles', icon: Users, requiredPermission: 'users.read' },
  { href: '/settings', labelKey: 'nav.settings', icon: Settings },
];

const PATH_TITLE_KEYS: Record<string, string> = {
  '/dashboard': 'nav.dashboard',
  '/zones': 'nav.zones',
  '/screen-groups': 'nav.screenGroups',
  '/devices': 'nav.devices',
  '/content': 'nav.content',
  '/publications': 'nav.publications',
  '/schedules': 'nav.schedules',
  '/releases': 'nav.releases',
  '/audit': 'nav.audit',
  '/admin/users': 'nav.userManagement',
  '/admin/roles': 'nav.roleManagement',
  '/settings': 'nav.settings',
};

export function getPathTitleKey(pathname: string) {
  if (pathname.startsWith('/schedules/')) {
    return 'nav.scheduleEditor';
  }

  if (pathname.startsWith('/devices/')) {
    return 'nav.playerDetails';
  }

  const direct = PATH_TITLE_KEYS[pathname];
  if (direct) return direct;

  const prefix = Object.keys(PATH_TITLE_KEYS).find((key) =>
    pathname.startsWith(`${key}/`),
  );
  return prefix ? PATH_TITLE_KEYS[prefix] : 'nav.appName';
}
