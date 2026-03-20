'use client'

import {
	SidebarInset,
	SidebarProvider,
} from '@/components/animate-ui/components/radix/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { getPathTitleKey } from '@/components/layout/navigation'
import { Topbar } from '@/components/layout/topbar'
import { useLocale } from '@/hooks/use-locale'
import { useUiStore } from '@/store/ui-store'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

export function AppShell({ children }: { children: ReactNode }) {
	const pathname = usePathname()
	const { t } = useLocale()
	const title = t(getPathTitleKey(pathname))
	const sidebarCollapsed = useUiStore(state => state.sidebarCollapsed)
	const setSidebarCollapsed = useUiStore(state => state.setSidebarCollapsed)

	return (
		<SidebarProvider
			open={!sidebarCollapsed}
			onOpenChange={open => setSidebarCollapsed(!open)}
		>
			<AppSidebar />
			<SidebarInset>
				<Topbar title={title} />
				<div className='flex flex-1 flex-col gap-4 p-4 pt-0'>{children}</div>
			</SidebarInset>
		</SidebarProvider>
	)
}
