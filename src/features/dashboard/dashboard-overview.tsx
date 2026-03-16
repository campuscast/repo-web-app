'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { ChartNoAxesColumn, Clock4, FileVideo2, MonitorSmartphone, PlaySquare, Tv } from 'lucide-react';
import { SlidingNumber } from '@/components/animate-ui/primitives/texts/sliding-number';
import { EmptyState } from '@/components/common/empty-state';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { useAuthStore } from '@/auth/store';
import { hasRole } from '@/auth/guards';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { queryKeys } from '@/lib/query-keys';
import { contentService } from '@/services/content-service';
import { deviceService } from '@/services/device-service';
import { scheduleService } from '@/services/schedule-service';
import { zoneService } from '@/services/zone-service';

const quickLinks = [
  { href: '/zones', label: 'Manage zones', icon: Tv },
  { href: '/devices', label: 'Register device', icon: MonitorSmartphone },
  { href: '/content', label: 'Upload content', icon: FileVideo2 },
  { href: '/schedules', label: 'Create schedule', icon: Clock4 }
];

export function DashboardOverview() {
  const roles = useAuthStore((state) => state.roles);
  const allowedZones = useAuthStore((state) => state.zones);
  const isAdmin = hasRole(roles, 'admin');

  const zonesQuery = useQuery({
    queryKey: queryKeys.zones,
    queryFn: zoneService.listZones
  });

  const visibleZones = useMemo(() => {
    const zones = zonesQuery.data ?? [];
    if (isAdmin) return zones;
    return zones.filter((zone) => allowedZones.includes(zone.zone_id));
  }, [allowedZones, isAdmin, zonesQuery.data]);

  const zoneIds = useMemo(() => visibleZones.map((z) => z.zone_id), [visibleZones]);

  const devicesQueries = useQueries({
    queries: zoneIds.map((zoneId) => ({
      queryKey: queryKeys.devices(zoneId),
      queryFn: () => deviceService.listByZone(zoneId),
      enabled: Boolean(zoneId)
    }))
  });

  const contentQueries = useQueries({
    queries: zoneIds.map((zoneId) => ({
      queryKey: queryKeys.content(zoneId),
      queryFn: () => contentService.list(zoneId),
      enabled: Boolean(zoneId)
    }))
  });

  const schedulesQueries = useQueries({
    queries: zoneIds.map((zoneId) => ({
      queryKey: queryKeys.schedules(zoneId),
      queryFn: () => scheduleService.listSchedules(zoneId),
      enabled: Boolean(zoneId)
    }))
  });

  const allDevices = useMemo(
    () => devicesQueries.flatMap((q) => q.data ?? []),
    [devicesQueries]
  );

  const stats = useMemo(() => {
    const content = contentQueries.flatMap((q) => q.data ?? []);
    const schedules = schedulesQueries.flatMap((q) => q.data ?? []);

    return {
      zones: visibleZones.length,
      devices: allDevices.length,
      activeDevices: allDevices.filter((d) => d.status === 'active').length,
      contentReady: content.filter((c) => c.status === 'ready').length,
      schedules: schedules.length
    };
  }, [allDevices, contentQueries, schedulesQueries, visibleZones.length]);

  const isAnyLoading = zonesQuery.isLoading || devicesQueries.some((q) => q.isLoading) || contentQueries.some((q) => q.isLoading);

  return (
    <div className="space-y-4">
      <PageHeader description="Состояние платформы и быстрые действия" />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {isAnyLoading ? (
          <Card className="md:col-span-2 xl:col-span-4">
            <CardContent className="py-10 text-sm text-muted-foreground">
              Loading platform metrics...
            </CardContent>
          </Card>
        ) : visibleZones.length ? (
          <>
            <MetricCard title="Zones" value={stats.zones} icon={Tv} helper="Visible within scope" />
            <MetricCard title="Devices" value={stats.devices} icon={MonitorSmartphone} helper={`${stats.activeDevices} active across all zones`} />
            <MetricCard title="Content ready" value={stats.contentReady} icon={FileVideo2} helper="Usable media assets" />
            <MetricCard title="Schedules" value={stats.schedules} icon={PlaySquare} helper="Draft / locked / published" />
          </>
        ) : (
          <Card className="md:col-span-2 xl:col-span-4">
            <CardContent className="py-10 text-sm text-muted-foreground">
              Metrics are unavailable because no zones are assigned to this account yet.
            </CardContent>
          </Card>
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Quick links</CardTitle>
            <CardDescription>Частые действия для ежедневной работы оператора</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {quickLinks.map((item) => {
              const Icon = item.icon;
              return (
                <Button key={item.href} variant="outline" className="h-14 justify-start gap-3" asChild>
                  <Link href={item.href}>
                    <Icon className="size-5" />
                    <span className="text-sm font-medium">{item.label}</span>
                  </Link>
                </Button>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>System status</CardTitle>
            <CardDescription>Сигналы по всем зонам</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <StatusLine
              label="API integration"
              status={zonesQuery.isError ? 'degraded' : 'healthy'}
              details={zonesQuery.isError ? 'Zone endpoint unavailable' : 'Operational'}
            />
            <StatusLine
              label="Device fleet"
              status={stats.activeDevices > 0 ? 'healthy' : 'warning'}
              details={`${stats.activeDevices} active players`}
            />
            <StatusLine
              label="Content pipeline"
              status={stats.contentReady > 0 ? 'healthy' : 'warning'}
              details={`${stats.contentReady} assets ready for playback`}
            />
            <StatusLine
              label="Schedule health"
              status={stats.schedules > 0 ? 'healthy' : 'warning'}
              details={`${stats.schedules} schedules total`}
            />
          </CardContent>
        </Card>
      </section>

      {!visibleZones.length && !zonesQuery.isLoading ? (
        <EmptyState
          title="No zones available"
          description="У вашего пользователя пока нет доступных зон. Проверьте role/zones scope в IAM."
          icon={<ChartNoAxesColumn className="size-8" />}
        />
      ) : null}
    </div>
  );
}

function MetricCard({
  title,
  value,
  helper,
  icon: Icon
}: {
  title: string;
  value: number;
  helper: string;
  icon: typeof Tv;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center justify-between text-xs uppercase tracking-wide">
          {title}
          <Icon className="size-4 text-muted-foreground" />
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold tabular-nums">
          <SlidingNumber number={value} initiallyStable thousandSeparator="," />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
      </CardContent>
    </Card>
  );
}

function StatusLine({
  label,
  status,
  details
}: {
  label: string;
  status: 'healthy' | 'warning' | 'degraded';
  details: string;
}) {
  const tone = status === 'healthy' ? 'success' : status === 'warning' ? 'warning' : 'danger';

  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{details}</div>
      </div>
      <StatusBadge
        tone={tone}
        label={status === 'healthy' ? 'Healthy' : status === 'warning' ? 'Warning' : 'Degraded'}
      />
    </div>
  );
}
