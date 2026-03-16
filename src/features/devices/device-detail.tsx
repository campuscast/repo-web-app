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
  Save
} from 'lucide-react';
import { toast } from 'sonner';
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
import type { Device } from '@/types/api';

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

const TABS = [
  { id: 'info', label: 'Info', icon: Info },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'content', label: 'Content', icon: Film },
  { id: 'criteria', label: 'Criteria & Tags', icon: Tags }
] as const;

type TabId = (typeof TABS)[number]['id'];

/* ─── Copy helper ──────────────────────────────────────────────── */

function CopyableValue({ label, value }: { label: string; value: string | null | undefined }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <InfoRow label={label} value="—" />;

  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        <code className="max-w-[280px] truncate font-mono text-sm">{value}</code>
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
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value || '—'}</span>
    </div>
  );
}

/* ─── Tab: Info ────────────────────────────────────────────────── */

function TabInfo({ device, onUpdated }: { device: Device; onUpdated: () => void }) {
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
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h3 className="mb-3 text-sm font-semibold">Player parameters</h3>
        <div className="rounded-lg border divide-y">
          <CopyableValue label="Player ID" value={formatPlayerId(device.device_id)} />
          <InfoRow label="Equipment type" value={formatDeviceType(device.device_type)} />
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-muted-foreground">Status</span>
            <Badge variant="outline" className={STATUS_STYLES[device.status] ?? ''}>
              {formatStatus(device.status)}
            </Badge>
          </div>
          <InfoRow label="MAC address" value={device.hardware_id} />
          <InfoRow label="MQTT Client ID" value={device.mqtt_client_id} />
          <InfoRow
            label="Registered"
            value={device.enrolled_at ? new Date(device.enrolled_at).toLocaleString('ru-RU') : undefined}
          />
          <InfoRow
            label="Last seen"
            value={device.last_seen ? new Date(device.last_seen).toLocaleString('ru-RU') : undefined}
          />
        </div>
      </div>

      {device.status === 'pending' && (
        <div>
          <h3 className="mb-3 text-sm font-semibold">Activate player</h3>
          <div className="rounded-lg border p-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              Enter the 6-digit activation code displayed on the player screen.
            </p>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Enter 6-digit code"
                value={activationCode}
                onChange={(e) => setActivationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
                className="max-w-[200px] font-mono text-lg tracking-widest"
              />
              <Button
                disabled={activationCode.length !== 6 || activateMutation.isPending}
                onClick={() => activateMutation.mutate()}
              >
                {activateMutation.isPending ? 'Activating...' : 'Activate'}
              </Button>
            </div>
          </div>
        </div>
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
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h3 className="mb-3 text-sm font-semibold">Device settings</h3>
        <div className="space-y-5 rounded-lg border p-5">
          <form onSubmit={handleRenameSubmit} className="space-y-2">
            <Label htmlFor="player-name">Player name</Label>
            <div className="flex items-center gap-2">
              <Input
                id="player-name"
                className="max-w-sm"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
              />
              {isNameDirty && (
                <Button
                  type="submit"
                  size="default"
                  disabled={!playerName.trim() || renameMutation.isPending}
                >
                  <Save className="size-4" />
                  {renameMutation.isPending ? 'Saving...' : 'Save'}
                </Button>
              )}
            </div>
          </form>

          <div className="space-y-2">
            <Label>Screen group</Label>
            <Select
              value={device.group_id}
              onValueChange={(groupId) => assignMutation.mutate(groupId)}
            >
              <SelectTrigger className="max-w-sm">
                <SelectValue placeholder="Select group" />
              </SelectTrigger>
              <SelectContent>
                {(groupsQuery.data ?? []).map((group) => (
                  <SelectItem key={group.group_id} value={group.group_id}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Equipment type</Label>
            <Input
              className="max-w-sm"
              value={formatDeviceType(device.device_type)}
              disabled
            />
            {!device.device_type && (
              <p className="text-xs text-muted-foreground">
                Equipment type will be determined when the player is activated.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Tab: Content ─────────────────────────────────────────────── */

function TabContent({ device }: { device: Device }) {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h3 className="mb-3 text-sm font-semibold">Currently playing</h3>
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <Film className="mb-3 size-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">No active playback</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {device.status === 'pending'
              ? 'Activate this player first to start content playback.'
              : 'Content status will appear here when the player is connected and playing.'}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─── Tab: Criteria & Tags ─────────────────────────────────────── */

function TabCriteria({ device }: { device: Device }) {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h3 className="mb-3 text-sm font-semibold">Criteria & Tags</h3>
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <Tags className="mb-3 size-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">No criteria configured</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Tags and targeting criteria allow you to deliver specific content to this player based on its properties.
          </p>
        </div>
      </div>
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
        {activeTab === 'info' && <TabInfo device={device} onUpdated={handleRefresh} />}
        {activeTab === 'settings' && <TabSettings device={device} onUpdated={handleRefresh} />}
        {activeTab === 'content' && <TabContent device={device} />}
        {activeTab === 'criteria' && <TabCriteria device={device} />}
      </div>
    </div>
  );
}
