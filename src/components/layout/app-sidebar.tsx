'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronsUpDown, LogOut, Settings, UserCircle2 } from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/animate-ui/components/radix/sidebar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuthStore } from '@/auth/store';
import { logout } from '@/services/auth-service';
import { APP_NAV_ITEMS } from '@/components/layout/navigation';

function formatUserCaption(email?: string) {
  if (!email || email.startsWith('unknown')) return 'Account';
  return email;
}

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { setOpenMobile } = useSidebar();

  const user = useAuthStore((state) => state.user);
  const roles = useAuthStore((state) => state.roles);
  const zones = useAuthStore((state) => state.zones);
  const crdtEnabled = useAuthStore((state) => state.crdtEnabled);
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const isAdmin = useAuthStore((state) => state.isAdmin);

  const visibleNavItems = APP_NAV_ITEMS.filter((item) => {
    if (item.adminOnly && !isAdmin()) return false;
    if (item.requiredPermission && !hasPermission(item.requiredPermission)) return false;
    return true;
  });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted">
                  <span className="cms-logo-mask size-7 bg-primary" aria-hidden />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">
                    CampusCast CMS
                  </span>
                  <span className="truncate text-xs">Control plane</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleNavItems.map((item) => {
                const Icon = item.icon;
                const isActive =
                  pathname === item.href ||
                  pathname.startsWith(`${item.href}/`);

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={item.label}
                    >
                      <Link
                        href={item.href}
                        onClick={() => setOpenMobile(false)}
                      >
                        <Icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted">
                    <UserCircle2 className="size-4" />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">
                      {user?.name && user.name !== 'unknown'
                        ? user.name
                        : 'CampusCast user'}
                    </span>
                    <span className="truncate text-xs">
                      {formatUserCaption(user?.email)}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                side="top"
                align="end"
                sideOffset={4}
              >
                <DropdownMenuLabel className="space-y-1 p-2">
                  <div className="text-sm font-medium">
                    {user?.name && user.name !== 'unknown'
                      ? user.name
                      : 'CampusCast user'}
                  </div>
                  <div className="text-xs font-normal text-muted-foreground">
                    {formatUserCaption(user?.email)}
                  </div>
                  {user?.id ? (
                    <div className="text-[11px] font-normal text-muted-foreground">
                      ID: {user.id}
                    </div>
                  ) : null}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />

                <div className="px-2 pb-2">
                  <div className="mb-1 text-[11px] text-muted-foreground">
                    Roles
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {roles.length ? (
                      roles.map((role) => (
                        <Badge key={role} variant="secondary">
                          {role}
                        </Badge>
                      ))
                    ) : (
                      <Badge variant="outline">No roles</Badge>
                    )}
                  </div>
                </div>

                <div className="px-2 pb-2">
                  <div className="mb-1 text-[11px] text-muted-foreground">
                    Zones
                  </div>
                  <div className="flex max-h-20 flex-wrap gap-1 overflow-auto">
                    {zones.length ? (
                      zones.map((zone) => (
                        <Badge key={zone} variant="outline">
                          {zone}
                        </Badge>
                      ))
                    ) : (
                      <Badge variant="outline">No zones</Badge>
                    )}
                  </div>
                </div>

                <div className="px-2 pb-2">
                  <Badge variant={crdtEnabled ? 'default' : 'outline'}>
                    CRDT {crdtEnabled ? 'enabled' : 'disabled'}
                  </Badge>
                </div>

                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link
                    href="/settings"
                    className="flex cursor-pointer items-center gap-2"
                  >
                    <Settings className="size-4" />
                    System settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="flex cursor-pointer items-center gap-2 text-destructive focus:text-destructive"
                  onClick={async () => {
                    await logout();
                    router.replace('/login');
                    router.refresh();
                  }}
                >
                  <LogOut className="size-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
