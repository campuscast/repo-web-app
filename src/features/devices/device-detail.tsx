'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Clipboard,
  Check,
  Info,
  Settings,
  Film,
  Tags,
  Trash2,
  RefreshCw,
  Save,
  Monitor,
  Camera,
  Loader2,
  ImageIcon
} from 'lucide-react';
import { toast } from 'sonner';
import { ActivationCodeInput } from '@/components/ui/activation-code-input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { formatPlayerId } from '@/lib/player-id';
import { queryKeys } from '@/lib/query-keys';
import { deviceService } from '@/services/device-service';
import { zoneService } from '@/services/zone-service';
import type { Device, DevicePreview, DeviceRuntime } from '@/types/api';

/* ─── Constants ────────────────────────────────────────────────── */

const DEVICE_TYPE_LABELS: Record<string, string> = {
  android_tv: 'Android TV',
  desktop: 'Desktop',
  web: 'Web Player'
};

function formatDeviceType(type: string | null | undefined): string {
  if (!type) return 'Not assigned';
  return DEVICE_TYPE_LABELS[type] ?? type;
}

const STATUS_STYLES: Record<string, string> = {
  active: 'border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400',
  pending: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  offline: 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400',
  revoked: 'border-muted-foreground/30 bg-muted text-muted-foreground'
};

function formatStatus(status: string): string {
  if (status === 'pending') return 'Not activated';
  return status;
}

function formatPlaybackStatus(status: string | null | undefined): string {
  if (!status) return 'Unknown';
  return status
    .split('_')
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ');
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString('ru-RU');
}

const TABS = [
  { id: 'info', label: 'Info', icon: Info },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'content', label: 'Content', icon: Film },
  { id: 'criteria', label: 'Criteria & Tags', icon: Tags }
] as const;

type TabId = (typeof TABS)[number]['id'];
const NO_GROUP_VALUE = '__no_group__';

/* ─── Copy helper ──────────────────────────────────────────────── */

function CopyableValue({ label, value }: { label: string; value: string | null | undefined }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <InfoRow label={label} value="—" />;

  return (
    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex min-w-0 items-center gap-1.5 self-stretch sm:max-w-[360px] sm:self-auto">
        <code className="min-w-0 flex-1 truncate font-mono text-sm text-right">{value}</code>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? <Check className="size-3 text-primary" /> : <Clipboard className="size-3" />}
        </Button>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium sm:text-right">{value || '—'}</span>
    </div>
  );
}

/* ─── Tab: Info ────────────────────────────────────────────────── */

function TabInfo({
  device,
  runtime,
  onUpdated
}: {
  device: Device;
  runtime?: DeviceRuntime;
  onUpdated: () => void;
}) {
  const [activationCode, setActivationCode] = useState('');

  const activateMutation = useMutation({
    mutationFn: () => deviceService.activateByCode(device.device_id, activationCode),
    onSuccess: () => {
      toast.success('Player activated');
      setActivationCode('');
      onUpdated();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'Activation failed'),
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <section className="rounded-lg border p-5">
          <h3 className="mb-4 text-sm font-semibold">Player parameters</h3>
          <div className="rounded-lg border divide-y overflow-hidden">
            <CopyableValue label="Player ID" value={formatPlayerId(device.device_id)} />
            <InfoRow label="Equipment type" value={formatDeviceType(device.device_type)} />
            <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              <Badge variant="outline" className={STATUS_STYLES[device.status] ?? ''}>
                {formatStatus(device.status)}
              </Badge>
            </div>
            <InfoRow label="MAC address" value={device.hardware_id} />
            <InfoRow label="MQTT Client ID" value={device.mqtt_client_id} />
            <InfoRow label="Registered" value={formatDateTime(device.enrolled_at)} />
            <InfoRow label="Last seen" value={formatDateTime(device.last_seen)} />
            <InfoRow label="Last telemetry" value={formatDateTime(runtime?.last_telemetry_at)} />
            <InfoRow label="Playback status" value={formatPlaybackStatus(runtime?.playback_status)} />
            <InfoRow label="Backend link" value={runtime?.backend_status || '—'} />
            <InfoRow label="MQTT link" value={runtime?.mqtt_status || '—'} />
          </div>
        </section>

        <section className="rounded-lg border p-5">
          <h3 className="mb-4 text-sm font-semibold">Detected screens</h3>
          {runtime?.displays?.length ? (
            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              {runtime.displays.map((display) => (
                <div
                  key={display.id}
                  className="flex items-center justify-between gap-4 rounded-md border bg-muted/20 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Monitor className="size-4 text-muted-foreground" />
                      <p className="truncate text-sm font-medium">{display.label}</p>
                      {display.selected ? (
                        <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                          Playback target
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {display.width} × {display.height} • {display.id}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex min-h-[220px] flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
              <Monitor className="mb-3 size-8 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">No screen telemetry yet</p>
              <p className="mt-1 max-w-md text-xs text-muted-foreground">
                Screen resolutions will appear here after the player activates and sends its first runtime sync.
              </p>
            </div>
          )}
        </section>
      </div>

      {device.status === 'pending' && (
        <section className="rounded-lg border p-5">
          <h3 className="mb-4 text-sm font-semibold">Activate player</h3>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Enter the 6-digit activation code displayed on the player screen.
              </p>
              <ActivationCodeInput
                value={activationCode}
                onChange={setActivationCode}
                autoFocus
                className="justify-start"
                aria-label="Activation code"
              />
            </div>
            <Button
              className="w-full xl:w-auto"
              disabled={activationCode.length !== 6 || activateMutation.isPending}
              onClick={() => activateMutation.mutate()}
            >
              {activateMutation.isPending ? 'Activating...' : 'Activate'}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

/* ─── Tab: Settings ────────────────────────────────────────────── */

function TabSettings({
  device,
  onUpdated
}: {
  device: Device;
  onUpdated: () => void;
}) {
  const [playerName, setPlayerName] = useState(device.device_name);
  const isNameDirty = playerName !== device.device_name;

  // Sync local state when device data refreshes
  useEffect(() => {
    setPlayerName(device.device_name);
  }, [device.device_name]);

  const groupsQuery = useQuery({
    queryKey: queryKeys.zoneGroups(device.zone_id),
    queryFn: () => zoneService.listGroups(device.zone_id),
    enabled: Boolean(device.zone_id)
  });

  const renameMutation = useMutation({
    mutationFn: (name: string) => deviceService.updateDevice(device.device_id, { device_name: name }),
    onSuccess: () => {
      toast.success('Player renamed');
      onUpdated();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to rename')
  });

  const assignMutation = useMutation({
    mutationFn: (groupId: string) => deviceService.assign(device.device_id, groupId),
    onSuccess: () => {
      toast.success('Group updated');
      onUpdated();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to update')
  });

  const handleRenameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (playerName.trim() && isNameDirty) {
      renameMutation.mutate(playerName.trim());
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-lg border p-5">
        <h3 className="mb-4 text-sm font-semibold">Device settings</h3>
        <div className="grid gap-6 xl:grid-cols-2">
          <form onSubmit={handleRenameSubmit} className="space-y-2">
            <Label htmlFor="player-name">Player name</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="player-name"
                className="w-full"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
              />
              {isNameDirty ? (
                <Button
                  type="submit"
                  size="default"
                  className="w-full sm:w-auto"
                  disabled={!playerName.trim() || renameMutation.isPending}
                >
                  <Save className="size-4" />
                  {renameMutation.isPending ? 'Saving...' : 'Save'}
                </Button>
              ) : null}
            </div>
          </form>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label>Screen group</Label>
              <Select
                value={device.group_id || NO_GROUP_VALUE}
                onValueChange={(groupId) => assignMutation.mutate(groupId === NO_GROUP_VALUE ? '' : groupId)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="No group" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_GROUP_VALUE}>No group</SelectItem>
                  {(groupsQuery.data ?? []).map((group) => (
                    <SelectItem key={group.group_id} value={group.group_id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                A player can stay ungrouped and still receive zone-wide schedules and releases.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Equipment type</Label>
              <Input className="w-full" value={formatDeviceType(device.device_type)} disabled />
              {!device.device_type ? (
                <p className="text-xs text-muted-foreground">
                  Equipment type will be determined when the player is activated.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ─── Tab: Content ─────────────────────────────────────────────── */

function TabContent({
  device,
  runtime
}: {
  device: Device;
  runtime?: DeviceRuntime;
}) {
  const queryClient = useQueryClient();
  const [selectedDisplayId, setSelectedDisplayId] = useState('');
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);
  const [lockedPreview, setLockedPreview] = useState<DevicePreview | null>(null);

  useEffect(() => {
    const availableDisplayIds = runtime?.displays.map((display) => display.id) ?? [];
    if (availableDisplayIds.length === 0) {
      setSelectedDisplayId('');
      return;
    }

    setSelectedDisplayId((current) => {
      if (current && availableDisplayIds.includes(current)) return current;
      return runtime?.displays.find((display) => display.selected)?.id ?? availableDisplayIds[0];
    });
  }, [runtime?.displays]);

  const previewQuery = useQuery({
    queryKey: queryKeys.devicePreview(device.device_id),
    queryFn: () => deviceService.getPreview(device.device_id),
    refetchInterval: pendingRequestId ? 2000 : false,
    refetchIntervalInBackground: Boolean(pendingRequestId),
  });

  useEffect(() => {
    if (!pendingRequestId || !previewQuery.data) return;
    if (previewQuery.data.request_id !== pendingRequestId) return;

    setLockedPreview(previewQuery.data);
    setPendingRequestId(null);
    if (previewQuery.data.status === 'ok' && (previewQuery.data.image_base64 || previewQuery.data.image_url)) {
      toast.success('Screenshot updated');
    } else {
      toast.error('Player responded, but screenshot capture failed');
    }
  }, [pendingRequestId, previewQuery.data]);

  const requestPreviewMutation = useMutation({
    mutationFn: () => deviceService.requestPreview(device.device_id, selectedDisplayId || undefined),
    onSuccess: (response) => {
      setPendingRequestId(response.request_id);
      toast.message('Screenshot requested. Waiting for the next player sync.');
      void queryClient.invalidateQueries({ queryKey: queryKeys.deviceRuntime(device.device_id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.devicePreview(device.device_id) });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to request screenshot'),
  });

  const preview = lockedPreview ?? previewQuery.data;
  const previewSrc = preview?.image_base64 || preview?.image_url || '';
  const canRequestScreenshot = device.status === 'active'
    && Boolean(selectedDisplayId)
    && (runtime?.displays.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <section className="rounded-lg border p-5">
          <h3 className="mb-4 text-sm font-semibold">Currently playing</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">Playback status</span>
              <Badge variant="outline" className={runtime?.playback_status === 'playing' ? STATUS_STYLES.active : ''}>
                {formatPlaybackStatus(runtime?.playback_status)}
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">Publication</span>
              <span className="text-right text-sm font-medium">
                {runtime?.current_publication_title || '—'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">Current item</span>
              <span className="text-right text-sm font-medium">
                {runtime?.current_publication_item_title || '—'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">Release</span>
              <span className="text-right text-sm font-medium">
                {runtime?.current_release_id || '—'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">Slot</span>
              <span className="text-right text-sm font-medium">
                {runtime?.current_slot_id || '—'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">Last runtime sync</span>
              <span className="text-right text-sm font-medium">
                {formatDateTime(runtime?.last_telemetry_at)}
              </span>
            </div>
            {runtime?.last_error ? (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                {runtime.last_error}
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-lg border p-5">
          <h3 className="mb-4 text-sm font-semibold">Screen capture</h3>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="space-y-2">
              <Label>Screen</Label>
              <Select value={selectedDisplayId} onValueChange={setSelectedDisplayId} disabled={!runtime?.displays.length}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select screen" />
                </SelectTrigger>
                <SelectContent>
                  {(runtime?.displays ?? []).map((display) => (
                    <SelectItem key={display.id} value={display.id}>
                      {display.label} ({display.width} × {display.height})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={() => requestPreviewMutation.mutate()}
              disabled={!canRequestScreenshot || requestPreviewMutation.isPending || Boolean(pendingRequestId)}
              className="w-full whitespace-nowrap lg:w-auto"
            >
              {requestPreviewMutation.isPending || pendingRequestId ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Camera className="size-4" />
              )}
              {pendingRequestId ? 'Waiting for screenshot...' : 'Request screenshot'}
            </Button>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            Request a single screenshot from the selected screen. The page will only poll while waiting for that screenshot.
          </p>
        </section>
      </div>

      <section>
        <h3 className="mb-3 text-sm font-semibold">Requested screenshot</h3>
        {previewSrc ? (
          <div className="overflow-hidden rounded-lg border">
            <img
              src={previewSrc}
              alt={preview?.display_label || device.device_name}
              className="aspect-video w-full bg-muted object-contain"
            />
            <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-xs text-muted-foreground">
              <span>
                {preview?.display_label || 'Unknown screen'}
                {preview?.width && preview?.height ? ` • ${preview.width} × ${preview.height}` : ''}
              </span>
              <span>
                Captured: {formatDateTime(preview?.captured_at)}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
            <ImageIcon className="mb-3 size-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">
              {device.status === 'pending' ? 'No screenshot yet' : 'No screenshot available yet'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {device.status === 'pending'
                ? 'Activate this player first to start content playback.'
                : 'Choose a detected screen and request a screenshot.'}
            </p>
          </div>
        )}

        {preview?.status && preview.status !== 'ok' ? (
          <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
            Player reported screenshot status: {preview.status}
          </p>
        ) : null}
      </section>
    </div>
  );
}

/* ─── Tab: Criteria & Tags ─────────────────────────────────────── */

function TabCriteria({ device }: { device: Device }) {
  return (
    <div className="space-y-6">
      <section className="rounded-lg border p-5">
        <h3 className="mb-4 text-sm font-semibold">Criteria & Tags</h3>
        <div className="flex min-h-[260px] flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <Tags className="mb-3 size-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">No criteria configured</p>
          <p className="mt-1 max-w-md text-xs text-muted-foreground">
            Tags and targeting criteria allow you to deliver specific content to this player based on its properties.
          </p>
        </div>
      </section>
    </div>
  );
}

/* ─── Main component ───────────────────────────────────────────── */

export function DeviceDetail({ deviceId }: { deviceId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const initialTab = (searchParams.get('tab') as TabId) || 'info';
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  const deviceQuery = useQuery({
    queryKey: ['device', deviceId],
    queryFn: () => deviceService.getDevice(deviceId)
  });

  const runtimeQuery = useQuery({
    queryKey: queryKeys.deviceRuntime(deviceId),
    queryFn: () => deviceService.getRuntime(deviceId),
    enabled: Boolean(deviceId),
    refetchInterval: activeTab === 'info' || activeTab === 'content' ? 5000 : false,
    refetchIntervalInBackground: activeTab === 'info' || activeTab === 'content',
  });

  const deleteMutation = useMutation({
    mutationFn: () => deviceService.deleteDevice(deviceId),
    onSuccess: () => {
      toast.success('Player deleted');
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      router.push('/devices');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to delete')
  });

  const device = deviceQuery.data;

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['device', deviceId] });
    queryClient.invalidateQueries({ queryKey: queryKeys.deviceRuntime(deviceId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.devicePreview(deviceId) });
  };

  const handleBack = () => {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push('/devices');
    }
  };

  if (deviceQuery.isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-6 w-48" />
        </div>
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (!device) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <p className="text-lg font-medium">Player not found</p>
        <p className="mt-1 text-sm text-muted-foreground">The device may have been deleted.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/devices')}>
          <ArrowLeft className="mr-1 size-4" />
          Back to devices
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={handleBack}>
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">{device.device_name}</h1>
            {device.device_type ? (
              <p className="text-xs text-muted-foreground">{formatDeviceType(device.device_type)}</p>
            ) : null}
          </div>
          <Badge variant="outline" className={STATUS_STYLES[device.status] ?? ''}>
            {formatStatus(device.status)}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="default" onClick={handleRefresh}>
            <RefreshCw className="size-4" />
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="default">
                <Trash2 className="size-4" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete player?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete <strong>{device.device_name}</strong> and revoke
                  all its credentials. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border bg-muted/50 p-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="size-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="rounded-lg border bg-card p-6">
        {activeTab === 'info' && <TabInfo device={device} runtime={runtimeQuery.data} onUpdated={handleRefresh} />}
        {activeTab === 'settings' && <TabSettings device={device} onUpdated={handleRefresh} />}
        {activeTab === 'content' && <TabContent device={device} runtime={runtimeQuery.data} />}
        {activeTab === 'criteria' && <TabCriteria device={device} />}
      </div>
    </div>
  );
}
