'use client';

import { Moon, Sun, Bell } from 'lucide-react';
import { useTheme } from 'next-themes';
import { SidebarTrigger } from '@/components/animate-ui/components/radix/sidebar';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/hooks/use-locale';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type TopbarProps = {
  title: string;
};

export function Topbar({ title }: TopbarProps) {
  const { setTheme, resolvedTheme } = useTheme();
  const { t } = useLocale();

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
      <div className="flex items-center gap-2 px-4">
        <SidebarTrigger className="-ml-1" />
        <h1 className="truncate text-base font-semibold">{title}</h1>
      </div>

      <div className="ml-auto flex items-center gap-1 px-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('topbar.notifications')}
            >
              <Bell className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel>{t('topbar.notifications')}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-default flex-col items-start">
              <span className="text-sm font-medium">{t('topbar.systemEvents')}</span>
              <span className="text-xs text-muted-foreground">
                {t('topbar.noNotifications')}
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="ghost"
          size="icon"
          aria-label={t('topbar.toggleTheme')}
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
        >
          <Sun className="size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>
      </div>
    </header>
  );
}
