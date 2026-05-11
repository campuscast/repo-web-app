'use client';

import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Grip, LayoutGrid, Loader2, Monitor, RefreshCw, Save, Tv } from 'lucide-react';
import { useRouter } from 'next/navigation';
import useMeasure from 'react-use-measure';
import { toast } from 'sonner';
import { hasRole } from '@/auth/guards';
import { useAuthStore } from '@/auth/store';
import { EmptyState } from '@/components/common/empty-state';
import { PageHeader } from '@/components/common/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { queryKeys } from '@/lib/query-keys';
import { deviceService } from '@/services/device-service';
import { zoneService } from '@/services/zone-service';
import type { ScreenGroup } from '@/types/api';
import {
  buildScreenGroupComposerItems,
  computeScreenGroupViewportScale,
  getScreenGroupLayoutBounds,
  mergeScreenGroupComposerItems,
  SCREEN_GROUP_CANVAS_PADDING,
  serializeScreenGroupLayout,
  toPersistedScreenGroupLayout,
  type ScreenGroupComposerItem,
} from './screen-group-layout';

type ScreenGroupComposerProps = {
  groupId: string;
  initialZoneId?: string;
};

type DragState = {
  key: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  originX: number;
  originY: number;
};

function StatCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="rounded-xl border bg-card/70 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
      {helper ? <p className="mt-1 text-xs text-muted-foreground">{helper}</p> : null}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4 rounded-2xl border p-4">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-56 w-full rounded-xl" />
        </div>
        <div className="rounded-2xl border p-4">
          <Skeleton className="h-[720px] w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

function serializeComposerItems(items: ScreenGroupComposerItem[]) {
  return JSON.stringify(items.map((item) => ({
    key: item.key,
    device_id: item.device_id,
    device_name: item.device_name,
    display_id: item.display_id,
    display_label: item.display_label,
    width: item.width,
    height: item.height,
    x: item.x,
    y: item.y,
    online: item.online,
    selected: item.selected,
    has_saved_position: item.has_saved_position,
  })));
}

export function ScreenGroupComposer({ groupId, initialZoneId }: ScreenGroupComposerProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const roles = useAuthStore((state) => state.roles);
  const allowedZones = useAuthStore((state) => state.zones);
  const isAdmin = hasRole(roles, 'admin');

  const [draftItems, setDraftItems] = useState<ScreenGroupComposerItem[]>([]);
  const [selectedDisplayKey, setSelectedDisplayKey] = useState('');
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [viewportRef, viewportBounds] = useMeasure();

  const zonesQuery = useQuery({
    queryKey: queryKeys.zones,
    queryFn: zoneService.listZones,
  });

  const visibleZones = useMemo(() => {
    const zones = zonesQuery.data ?? [];
    return isAdmin ? zones : zones.filter((zone) => allowedZones.includes(zone.zone_id));
  }, [allowedZones, isAdmin, zonesQuery.data]);

  const candidateZoneIds = useMemo(() => {
    if (initialZoneId && visibleZones.some((zone) => zone.zone_id === initialZoneId)) {
      return [initialZoneId];
    }

    return visibleZones.map((zone) => zone.zone_id);
  }, [initialZoneId, visibleZones]);

  const groupQueries = useQueries({
    queries: candidateZoneIds.map((zoneId) => ({
      queryKey: queryKeys.zoneGroups(zoneId),
      queryFn: () => zoneService.listGroups(zoneId),
      enabled: Boolean(zoneId),
    })),
  });

  const groupLoading = zonesQuery.isLoading || groupQueries.some((query) => query.isLoading);
  const group = useMemo<ScreenGroup | null>(() => {
    for (const query of groupQueries) {
      const match = (query.data ?? []).find((entry) => entry.group_id === groupId);
      if (match) {
        return match;
      }
    }

    return null;
  }, [groupId, groupQueries]);

  const zoneName = useMemo(() => {
    if (!group) {
      return '';
    }

    return visibleZones.find((zone) => zone.zone_id === group.zone_id)?.name ?? group.zone_id;
  }, [group, visibleZones]);

  const devicesQuery = useQuery({
    queryKey: group ? queryKeys.devices(group.zone_id) : ['devices', 'screen-group', groupId],
    queryFn: () => deviceService.listByZone(group!.zone_id),
    enabled: Boolean(group?.zone_id),
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
  });

  const groupDevices = useMemo(
    () => (devicesQuery.data ?? []).filter((device) => device.group_id === groupId),
    [devicesQuery.data, groupId],
  );

  const runtimeQueries = useQueries({
    queries: groupDevices.map((device) => ({
      queryKey: queryKeys.deviceRuntime(device.device_id),
      queryFn: () => deviceService.getRuntime(device.device_id),
      enabled: Boolean(group?.group_id),
      refetchInterval: 10_000,
      refetchIntervalInBackground: true,
    })),
  });

  const runtimes = useMemo(() => {
    return new Map(
      groupDevices.map((device, index) => [device.device_id, runtimeQueries[index]?.data]),
    );
  }, [groupDevices, runtimeQueries]);

  const suggestedItems = useMemo(
    () => buildScreenGroupComposerItems({
      devices: groupDevices,
      runtimes,
      savedLayoutItems: group?.layout_items ?? [],
    }),
    [group?.layout_items, groupDevices, runtimes],
  );
  const suggestedItemsSignature = useMemo(
    () => serializeComposerItems(suggestedItems),
    [suggestedItems],
  );

  useEffect(() => {
    setDraftItems((currentItems) => {
      const mergedItems = mergeScreenGroupComposerItems(currentItems, suggestedItems);
      return serializeComposerItems(mergedItems) === serializeComposerItems(currentItems)
        ? currentItems
        : mergedItems;
    });
  }, [suggestedItemsSignature]);

  const activeSelectedDisplayKey = useMemo(() => {
    if (draftItems.some((item) => item.key === selectedDisplayKey)) {
      return selectedDisplayKey;
    }

    return draftItems[0]?.key ?? '';
  }, [draftItems, selectedDisplayKey]);

  const selectedItem = useMemo(
    () => draftItems.find((item) => item.key === activeSelectedDisplayKey) ?? null,
    [activeSelectedDisplayKey, draftItems],
  );

  const layoutBounds = useMemo(
    () => getScreenGroupLayoutBounds(draftItems),
    [draftItems],
  );

  const scale = useMemo(
    () => computeScreenGroupViewportScale({
      bounds: layoutBounds,
      viewportWidth: viewportBounds.width,
      viewportHeight: viewportBounds.height,
    }),
    [layoutBounds, viewportBounds.height, viewportBounds.width],
  );

  const workspaceWidth = Math.max(layoutBounds.width + SCREEN_GROUP_CANVAS_PADDING, 1280);
  const workspaceHeight = Math.max(layoutBounds.height + SCREEN_GROUP_CANVAS_PADDING, 720);
  const workspaceOffsetX = draftItems.length
    ? SCREEN_GROUP_CANVAS_PADDING / 2 - layoutBounds.minX
    : SCREEN_GROUP_CANVAS_PADDING / 2;
  const workspaceOffsetY = draftItems.length
    ? SCREEN_GROUP_CANVAS_PADDING / 2 - layoutBounds.minY
    : SCREEN_GROUP_CANVAS_PADDING / 2;

  const persistedDraftLayout = useMemo(
    () => toPersistedScreenGroupLayout(draftItems),
    [draftItems],
  );
  const persistedSavedLayout = useMemo(
    () => group?.layout_items ?? [],
    [group?.layout_items],
  );
  const hasUnsavedChanges = useMemo(
    () => serializeScreenGroupLayout(persistedDraftLayout) !== serializeScreenGroupLayout(persistedSavedLayout),
    [persistedDraftLayout, persistedSavedLayout],
  );

  const composerLoading = groupLoading || (Boolean(group) && devicesQuery.isLoading && !devicesQuery.data);

  const updateItemPosition = (key: string, nextPatch: Partial<Pick<ScreenGroupComposerItem, 'x' | 'y'>>) => {
    setDraftItems((currentItems) => currentItems.map((item) => {
      if (item.key !== key) {
        return item;
      }

      return {
        ...item,
        ...nextPatch,
      };
    }));
  };

  const autoArrange = () => {
    setDraftItems(suggestedItems);
    toast.success('Composition auto-arranged');
  };

  const saveLayoutMutation = useMutation({
    mutationFn: () => zoneService.updateGroupLayout(group!.zone_id, group!.group_id, { items: persistedDraftLayout }),
    onSuccess: async (updatedGroup) => {
      queryClient.setQueryData<ScreenGroup[]>(queryKeys.zoneGroups(updatedGroup.zone_id), (currentGroups) =>
        (currentGroups ?? []).map((entry) => entry.group_id === updatedGroup.group_id ? updatedGroup : entry),
      );
      await queryClient.invalidateQueries({ queryKey: queryKeys.zoneGroups(updatedGroup.zone_id) });
      setDraftItems((currentItems) => mergeScreenGroupComposerItems(currentItems, buildScreenGroupComposerItems({
        devices: groupDevices,
        runtimes,
        savedLayoutItems: updatedGroup.layout_items,
      })));
      toast.success('Composition saved');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to save composition'),
  });

  const handleWindowPointerMove = useEffectEvent((event: PointerEvent) => {
    if (!dragState) {
      return;
    }

    const deltaX = (event.clientX - dragState.startClientX) / scale;
    const deltaY = (event.clientY - dragState.startClientY) / scale;
    updateItemPosition(dragState.key, {
      x: Math.round(dragState.originX + deltaX),
      y: Math.round(dragState.originY + deltaY),
    });
  });

  const handleWindowPointerUp = useEffectEvent((event: PointerEvent) => {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }

    setDragState(null);
  });

  useEffect(() => {
    if (!dragState) {
      return undefined;
    }

    const onPointerMove = (event: PointerEvent) => handleWindowPointerMove(event);
    const onPointerUp = (event: PointerEvent) => handleWindowPointerUp(event);

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [dragState, handleWindowPointerMove, handleWindowPointerUp]);

  if (composerLoading) {
    return <LoadingState />;
  }

  if (!group) {
    return (
      <div className="space-y-4">
        <Button variant="outline" size="sm" onClick={() => router.push('/screen-groups')}>
          <ArrowLeft className="size-4" />
          Back to Screen Groups
        </Button>
        <EmptyState
          icon={<Tv className="size-8" />}
          title="Screen group not found"
          description="Группа не найдена или у текущего пользователя нет доступа к соответствующей зоне."
          actionLabel="Open Screen Groups"
          onAction={() => router.push('/screen-groups')}
        />
      </div>
    );
  }

  const onlineCount = draftItems.filter((item) => item.online).length;
  const playbackTargetCount = draftItems.filter((item) => item.selected).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <Button variant="outline" size="icon-sm" onClick={() => router.push('/screen-groups')} aria-label="Back to screen groups">
            <ArrowLeft className="size-4" />
          </Button>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-semibold tracking-tight">{group.name}</h2>
              <Badge variant="outline" className={cn(
                hasUnsavedChanges
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                  : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
              )}>
                {hasUnsavedChanges ? 'Unsaved layout' : 'Saved layout'}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {zoneName}
              {group.description ? ` • ${group.description}` : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={autoArrange} disabled={!suggestedItems.length || saveLayoutMutation.isPending}>
            <LayoutGrid className="size-4" />
            Auto arrange
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              void Promise.all([
                queryClient.invalidateQueries({ queryKey: queryKeys.devices(group.zone_id) }),
                ...groupDevices.map((device) =>
                  queryClient.invalidateQueries({ queryKey: queryKeys.deviceRuntime(device.device_id) }),
                ),
              ]);
            }}
            disabled={saveLayoutMutation.isPending}
          >
            <RefreshCw className="size-4" />
            Refresh devices
          </Button>
          <Button onClick={() => saveLayoutMutation.mutate()} disabled={!draftItems.length || !hasUnsavedChanges || saveLayoutMutation.isPending}>
            {saveLayoutMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save composition
          </Button>
        </div>
      </div>

      <PageHeader
        description="Расположите детектированные экраны относительно друг друга. Размер каждой рамки соответствует фактическому разрешению экрана."
      />

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <StatCard label="Devices" value={String(groupDevices.length)} helper="Устройств в группе" />
            <StatCard label="Screens" value={String(draftItems.length)} helper="Детектированных экранов" />
            <StatCard label="Targets" value={String(playbackTargetCount)} helper={`${onlineCount} online`} />
          </div>

          <div className="rounded-2xl border bg-card/90">
            <div className="border-b px-4 py-3">
              <p className="text-sm font-semibold">Screens in group</p>
              <p className="text-xs text-muted-foreground">Выберите экран в списке или прямо на canvas.</p>
            </div>
            <ScrollArea className="h-[320px]">
              <div className="space-y-2 p-3">
                {draftItems.length ? draftItems.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setSelectedDisplayKey(item.key)}
                    className={cn(
                      'w-full rounded-xl border px-3 py-3 text-left transition-colors',
                      item.key === activeSelectedDisplayKey
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-background hover:bg-muted/40',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{item.display_label}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.device_name}</p>
                      </div>
                      <Badge variant="outline" className={cn(
                        item.online
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                          : 'border-slate-500/30 bg-slate-500/10 text-slate-600 dark:text-slate-300',
                      )}>
                        {item.online ? 'Online' : 'Offline'}
                      </Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{item.width} x {item.height}</span>
                      {item.selected ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">Playback target</span> : null}
                    </div>
                  </button>
                )) : (
                  <div className="rounded-xl border border-dashed px-4 py-8 text-center">
                    <Monitor className="mx-auto size-8 text-muted-foreground/40" />
                    <p className="mt-3 text-sm font-medium">No screen telemetry</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Экраны появятся здесь после того, как устройства группы пришлют runtime-метаданные.
                    </p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>

          <div className="rounded-2xl border bg-card/90">
            <div className="border-b px-4 py-3">
              <p className="text-sm font-semibold">Selected screen</p>
              <p className="text-xs text-muted-foreground">Точная подстройка координат для выбранного экрана.</p>
            </div>
            {selectedItem ? (
              <div className="space-y-4 p-4">
                <div className="rounded-xl border bg-muted/20 p-3">
                  <p className="text-sm font-medium">{selectedItem.display_label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{selectedItem.device_name}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {selectedItem.width} x {selectedItem.height} • {selectedItem.display_id}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor="screen-layout-x" className="text-xs font-medium text-muted-foreground">X</label>
                    <Input
                      id="screen-layout-x"
                      type="number"
                      value={selectedItem.x}
                      onChange={(event) => updateItemPosition(selectedItem.key, { x: Number(event.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="screen-layout-y" className="text-xs font-medium text-muted-foreground">Y</label>
                    <Input
                      id="screen-layout-y"
                      type="number"
                      value={selectedItem.y}
                      onChange={(event) => updateItemPosition(selectedItem.key, { y: Number(event.target.value) || 0 })}
                    />
                  </div>
                </div>

                <div className="rounded-xl border bg-muted/20 p-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Grip className="size-3.5" />
                    Drag any screen inside the canvas to change its position.
                  </div>
                  <div className="mt-2">
                    Scale on canvas: {scale.toFixed(2)}x
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4">
                <EmptyState
                  icon={<Monitor className="size-8" />}
                  title="No screen selected"
                  description="Выберите экран слева, чтобы увидеть его параметры и точные координаты."
                />
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border bg-card/90 p-4">
          {draftItems.length ? (
            <div
              ref={viewportRef}
              className="relative min-h-[720px] overflow-auto rounded-2xl border border-dashed bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.08),transparent_32%),linear-gradient(180deg,rgba(248,250,252,0.92),rgba(241,245,249,0.88))] dark:bg-[radial-gradient(circle_at_top_left,rgba(96,165,250,0.12),transparent_30%),linear-gradient(180deg,rgba(15,23,42,0.92),rgba(15,23,42,0.82))]"
            >
              <div className="flex min-h-[720px] min-w-full items-center justify-center p-6">
                <div style={{ width: workspaceWidth * scale, height: workspaceHeight * scale }}>
                  <div
                    className="relative overflow-hidden rounded-[28px] border border-border/70 bg-[linear-gradient(90deg,rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(rgba(148,163,184,0.12)_1px,transparent_1px)] bg-[size:120px_120px] shadow-[0_30px_90px_-40px_rgba(15,23,42,0.45)]"
                    style={{
                      width: workspaceWidth,
                      height: workspaceHeight,
                      transform: `scale(${scale})`,
                      transformOrigin: 'top left',
                    }}
                  >
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.22),transparent_58%)] dark:bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.08),transparent_60%)]" />

                    {draftItems.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        className={cn(
                          'absolute overflow-hidden rounded-[28px] border text-left shadow-[0_18px_60px_-30px_rgba(15,23,42,0.65)] transition-transform outline-none',
                          'touch-none select-none',
                          item.key === activeSelectedDisplayKey
                            ? 'border-primary bg-primary/12 ring-2 ring-primary/30'
                            : 'border-border/80 bg-card/92 hover:scale-[1.01]',
                          dragState?.key === item.key ? 'cursor-grabbing' : 'cursor-grab',
                        )}
                        style={{
                          left: item.x + workspaceOffsetX,
                          top: item.y + workspaceOffsetY,
                          width: item.width,
                          height: item.height,
                        }}
                        onClick={() => setSelectedDisplayKey(item.key)}
                        onPointerDown={(event) => {
                          event.preventDefault();
                          setSelectedDisplayKey(item.key);
                          setDragState({
                            key: item.key,
                            pointerId: event.pointerId,
                            startClientX: event.clientX,
                            startClientY: event.clientY,
                            originX: item.x,
                            originY: item.y,
                          });
                        }}
                      >
                        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 bg-gradient-to-b from-slate-950/70 via-slate-950/35 to-transparent p-6 text-white">
                          <div className="min-w-0">
                            <p className="truncate text-lg font-semibold">{item.display_label}</p>
                            <p className="mt-1 truncate text-xs uppercase tracking-[0.18em] text-white/70">{item.device_name}</p>
                          </div>
                          <div className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-medium">
                            {item.width} x {item.height}
                          </div>
                        </div>

                        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(15,23,42,0.06),transparent_45%,rgba(59,130,246,0.06))]" />

                        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-gradient-to-t from-slate-950/80 via-slate-950/45 to-transparent p-6 text-xs text-white/80">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              'size-2 rounded-full',
                              item.online ? 'bg-emerald-400' : 'bg-slate-300/80',
                            )} />
                            {item.online ? 'Online' : 'Offline'}
                          </div>
                          {item.selected ? (
                            <span className="rounded-full border border-cyan-300/30 bg-cyan-300/15 px-3 py-1 text-cyan-100">
                              Playback target
                            </span>
                          ) : null}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={<Monitor className="size-8" />}
              title="No screens available for composition"
              description="В этой группе пока нет устройств с детектированными экранами. Как только runtime пришлёт размеры экранов, здесь появится editor."
            />
          )}
        </div>
      </div>
    </div>
  );
}
