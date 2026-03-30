'use client';

import { useCallback, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ChevronRight,
  Clipboard,
  Info,
  Laptop,
  Monitor,
  Smartphone,
  Tv
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/auth/store';
import { hasRole } from '@/auth/guards';
import { Badge } from '@/components/ui/badge';
import { ActivationCodeInput } from '@/components/ui/activation-code-input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { formatPlayerId } from '@/lib/player-id';
import { queryKeys } from '@/lib/query-keys';
import { deviceService } from '@/services/device-service';
import { zoneService } from '@/services/zone-service';
import type { CreatePendingRequest, ActivationResponse } from '@/types/api';

/* ─── Schemas ───────────────────────────────────────────────────── */

const NO_GROUP_VALUE = '__no_group__';

const createPlayerSchema = z.object({
  device_name: z.string().min(2, 'Minimum 2 characters'),
  hardware_id: z.string().optional(),
  zone_id: z.string().min(1, 'Select a zone'),
  group_id: z.string()
});

type CreatePlayerForm = z.infer<typeof createPlayerSchema>;

/* ─── Platform data ─────────────────────────────────────────────── */

interface PlatformCard {
  id: string;
  name: string;
  icon: React.ReactNode;
  description: string;
  available: boolean;
}

const PLATFORMS: PlatformCard[] = [
  { id: 'android', name: 'Android', icon: <Smartphone className="size-6" />, description: 'Android 8.0+, Android TV', available: false },
  { id: 'ubuntu', name: 'Ubuntu / Linux', icon: <Monitor className="size-6" />, description: 'Ubuntu 20.04+, Debian 11+', available: false },
  { id: 'windows', name: 'Windows', icon: <Laptop className="size-6" />, description: 'Windows 10/11 x64', available: false },
  { id: 'raspberry', name: 'Raspberry Pi', icon: <Tv className="size-6" />, description: 'Raspberry Pi 4/5, Pi OS', available: false },
  { id: 'web', name: 'Web Player', icon: <Monitor className="size-6" />, description: 'Any modern browser', available: false }
];

/* ─── Stepper ───────────────────────────────────────────────────── */

const STEPS = [
  { number: 1, title: 'Create player', description: 'Fill in device details' },
  { number: 2, title: 'Install player', description: 'Download & install' },
  { number: 3, title: 'Activate', description: 'Connect device to CMS' }
] as const;

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center gap-1">
      {STEPS.map((step, index) => {
        const isCompleted = currentStep > step.number;
        const isCurrent = currentStep === step.number;

        return (
          <div key={step.number} className="flex items-center gap-1">
            {index > 0 && (
              <ChevronRight className={`size-4 shrink-0 ${isCompleted ? 'text-primary' : 'text-muted-foreground/40'}`} />
            )}
            <div className="flex items-center gap-2">
              <div
                className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                  isCompleted
                    ? 'bg-primary text-primary-foreground'
                    : isCurrent
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {isCompleted ? <Check className="size-3.5" /> : step.number}
              </div>
              <div className="hidden sm:block">
                <p className={`text-xs font-medium leading-none ${isCurrent ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {step.title}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Copyable field ────────────────────────────────────────────── */

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [value]);

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
        <code className="flex-1 break-all font-mono text-xs">{value}</code>
        <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={handleCopy}>
          {copied ? <Check className="size-3.5 text-primary" /> : <Clipboard className="size-3.5" />}
        </Button>
      </div>
    </div>
  );
}

/* ─── Step 1: Create Player Card ────────────────────────────────── */

function StepCreatePlayer({
  onCreated,
  isPending
}: {
  onCreated: (form: CreatePlayerForm) => void;
  isPending: boolean;
}) {
  const roles = useAuthStore((state) => state.roles);
  const allowedZones = useAuthStore((state) => state.zones);
  const isAdmin = hasRole(roles, 'admin');

  const form = useForm<CreatePlayerForm>({
    resolver: zodResolver(createPlayerSchema),
    defaultValues: {
      device_name: '',
      hardware_id: '',
      zone_id: '',
      group_id: ''
    }
  });

  const zonesQuery = useQuery({ queryKey: queryKeys.zones, queryFn: zoneService.listZones });

  const visibleZones = useMemo(() => {
    const zones = zonesQuery.data ?? [];
    return isAdmin ? zones : zones.filter((zone) => allowedZones.includes(zone.zone_id));
  }, [allowedZones, isAdmin, zonesQuery.data]);

  const selectedZoneId = form.watch('zone_id');

  const groupsQuery = useQuery({
    queryKey: selectedZoneId ? queryKeys.zoneGroups(selectedZoneId) : ['groups', 'none'],
    queryFn: () => zoneService.listGroups(selectedZoneId),
    enabled: Boolean(selectedZoneId)
  });

  return (
    <form className="grid gap-4" onSubmit={form.handleSubmit(onCreated)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="device_name">Player name <span className="text-destructive">*</span></Label>
          <Input id="device_name" placeholder="e.g. Lobby Display #1" {...form.register('device_name')} autoFocus />
          {form.formState.errors.device_name && (
            <p className="text-xs text-destructive">{form.formState.errors.device_name.message}</p>
          )}
        </div>

        <div className="min-w-0 space-y-2">
          <Label>Zone <span className="text-destructive">*</span></Label>
          <Select
            value={selectedZoneId}
            onValueChange={(value) => {
              form.setValue('zone_id', value, { shouldValidate: true });
              form.setValue('group_id', '', { shouldValidate: true });
            }}
          >
            <SelectTrigger className="w-full"><SelectValue placeholder="Select zone" /></SelectTrigger>
            <SelectContent>
              {visibleZones.map((zone) => (
                <SelectItem key={zone.zone_id} value={zone.zone_id}>{zone.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {form.formState.errors.zone_id && (
            <p className="text-xs text-destructive">{form.formState.errors.zone_id.message}</p>
          )}
        </div>

        <div className="min-w-0 space-y-2">
          <Label>Screen group <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
          <Select
            value={selectedZoneId ? (form.watch('group_id') || NO_GROUP_VALUE) : ''}
            onValueChange={(value) => form.setValue('group_id', value === NO_GROUP_VALUE ? '' : value, { shouldValidate: true })}
            disabled={!selectedZoneId}
          >
            <SelectTrigger className="w-full"><SelectValue placeholder="Select group" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_GROUP_VALUE}>No group</SelectItem>
              {(groupsQuery.data ?? []).map((group) => (
                <SelectItem key={group.group_id} value={group.group_id}>{group.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Hardware ID <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
          <Input placeholder="e.g. MAC address or serial number" {...form.register('hardware_id')} />
        </div>
      </div>

      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Creating...' : 'Create player'}
          {!isPending && <ChevronRight className="ml-1 size-4" />}
        </Button>
      </DialogFooter>
    </form>
  );
}

/* ─── Step 2: Install Player ────────────────────────────────────── */

function StepInstallPlayer({
  playerId,
  formData,
  onNext
}: {
  playerId: string;
  formData: CreatePlayerForm;
  onNext: () => void;
}) {
  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="rounded-lg border bg-muted/30 p-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">{formData.device_name}</p>
          </div>
          <Badge variant="secondary" className="shrink-0">Created</Badge>
        </div>
      </div>

      {/* Install instructions */}
      <div>
        <h4 className="text-sm font-semibold">1. Download and install the player</h4>
        <p className="mt-1 text-xs text-muted-foreground">
          Choose the platform that matches your target device. Install the CampusCast Player application.
        </p>
      </div>

      {/* Platform cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {PLATFORMS.map((platform) => (
          <button
            key={platform.id}
            type="button"
            disabled={!platform.available}
            className="flex flex-col items-center gap-1.5 rounded-lg border bg-card p-3 text-center transition-colors hover:bg-accent/50 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => toast.info('Player builds are being prepared')}
          >
            <div className="flex size-10 items-center justify-center rounded-md bg-muted">
              {platform.icon}
            </div>
            <span className="text-xs font-medium">{platform.name}</span>
            <span className="text-[10px] leading-tight text-muted-foreground">{platform.description}</span>
          </button>
        ))}
      </div>

      <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 p-3">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" />
        <p className="text-xs text-muted-foreground">
          Player builds are under development. Platform downloads will become available as builds are published.
        </p>
      </div>

      <Separator />

      {/* Player ID + next step instructions */}
      <div>
        <h4 className="text-sm font-semibold">2. Enter the Player ID on the device</h4>
        <p className="mb-3 mt-1 text-xs text-muted-foreground">
          After installing, launch the CampusCast Player and enter the Player ID below when prompted.
          The player will display an <strong>activation code</strong> on screen.
        </p>
        <CopyField label="Player ID" value={playerId} />
      </div>

      <div className="rounded-md bg-muted/50 p-3">
        <p className="text-xs font-medium">Next steps:</p>
        <ol className="mt-1.5 list-inside list-decimal space-y-1 text-xs text-muted-foreground">
          <li>Launch the CampusCast Player on the device</li>
          <li>Enter the Player ID above when prompted</li>
          <li>Note the activation code shown on the player screen</li>
          <li>Enter the activation code on the next step in this wizard</li>
        </ol>
      </div>

      <DialogFooter>
        <Button onClick={onNext}>
          Continue to activation
          <ChevronRight className="ml-1 size-4" />
        </Button>
      </DialogFooter>
    </div>
  );
}

/* ─── Step 3: Activate Player ───────────────────────────────────── */

function StepActivatePlayer({
  deviceId,
  playerId,
  formData,
  onActivated,
  onDone
}: {
  deviceId: string;
  playerId: string;
  formData: CreatePlayerForm;
  onActivated: (result: ActivationResponse) => void;
  onDone: () => void;
}) {
  const [activationCode, setActivationCode] = useState('');
  const [macAddress, setMacAddress] = useState('');
  const [activeTab, setActiveTab] = useState<'code' | 'mac'>('code');
  const [activationResult, setActivationResult] = useState<ActivationResponse | null>(null);

  const activateByCodeMutation = useMutation({
    mutationFn: () => deviceService.activateByCode(deviceId, activationCode),
    onSuccess: (result) => {
      setActivationResult(result);
      onActivated(result);
      toast.success('Player activated');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Activation failed')
  });

  const activateByMacMutation = useMutation({
    mutationFn: () => deviceService.activateByMac(deviceId, macAddress),
    onSuccess: (result) => {
      setActivationResult(result);
      onActivated(result);
      toast.success('Player activated');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Activation failed')
  });

  const isActivating = activateByCodeMutation.isPending || activateByMacMutation.isPending;
  const isActivated = !!activationResult;

  return (
    <div className="space-y-5">
      {/* Device summary */}
      <div className="rounded-lg border bg-muted/30 p-3">
        <div className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
          <div className="flex justify-between sm:justify-start sm:gap-2">
            <span className="text-muted-foreground">Name:</span>
            <span className="font-medium">{formData.device_name}</span>
          </div>
          <div className="flex justify-between sm:justify-start sm:gap-2">
            <span className="text-muted-foreground">Player ID:</span>
            <code className="font-mono font-medium">{playerId}</code>
          </div>
          <div className="flex justify-between sm:justify-start sm:gap-2">
            <span className="text-muted-foreground">Status:</span>
            {isActivated ? (
              <Badge variant="outline" className="h-5 border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400">active</Badge>
            ) : (
              <Badge variant="outline" className="h-5 border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">pending</Badge>
            )}
          </div>
        </div>
      </div>

      {/* If already activated — success state */}
      {isActivated ? (
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-md border border-green-500/20 bg-green-500/5 p-3">
            <Check className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" />
            <div>
              <p className="text-xs font-medium">Player activated successfully</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {activeTab === 'code'
                  ? 'The player will automatically receive its credentials and begin connecting. No further action needed.'
                  : 'The device has been activated by MAC address. Credentials have been generated.'}
              </p>
            </div>
          </div>

          <Separator />
          <DialogFooter>
            <Button onClick={onDone}>Done</Button>
          </DialogFooter>
        </div>
      ) : (
        <>
          {/* Activation method tabs */}
          <div className="flex gap-1 rounded-lg border bg-muted/50 p-1">
            {([
              { id: 'code' as const, label: 'By activation code' },
              { id: 'mac' as const, label: 'By MAC address' }
            ]).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab: By activation code */}
          {activeTab === 'code' && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 p-3">
                <Info className="mt-0.5 size-4 shrink-0 text-primary" />
                <p className="text-xs text-muted-foreground">
                  Launch the CampusCast Player on the device and enter the Player ID.
                  The player will display a 6-digit activation code on its screen.
                  Enter that code below to complete the activation.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Activation code</Label>
                <ActivationCodeInput
                  value={activationCode}
                  onChange={setActivationCode}
                  autoFocus={activeTab === 'code'}
                  className="justify-start"
                  aria-label="Activation code"
                />
                <p className="text-xs text-muted-foreground">
                  The code is valid for 15 minutes after generation.
                </p>
              </div>

              <Button
                className="w-full"
                disabled={activationCode.length !== 6 || isActivating}
                onClick={() => activateByCodeMutation.mutate()}
              >
                {isActivating ? 'Activating...' : 'Activate player'}
              </Button>
            </div>
          )}

          {/* Tab: By MAC address */}
          {activeTab === 'mac' && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 p-3">
                <Info className="mt-0.5 size-4 shrink-0 text-primary" />
                <p className="text-xs text-muted-foreground">
                  Enter the MAC address of the physical device to bind it to this player record.
                  The device will be activated immediately upon matching.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mac_address">MAC address</Label>
                <Input
                  id="mac_address"
                  placeholder="AA:BB:CC:DD:EE:FF"
                  value={macAddress}
                  onChange={(e) => setMacAddress(e.target.value)}
                  className="font-mono"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  The device MAC address can be found in the device settings or on the hardware label.
                </p>
              </div>

              <Button
                className="w-full"
                disabled={!macAddress.trim() || isActivating}
                onClick={() => activateByMacMutation.mutate()}
              >
                {isActivating ? 'Activating...' : 'Activate by MAC'}
              </Button>
            </div>
          )}

          <Separator />
          <DialogFooter>
            <Button variant="outline" onClick={onDone}>
              Skip — activate later
            </Button>
          </DialogFooter>
        </>
      )}
    </div>
  );
}

/* ─── Main Wizard Component ─────────────────────────────────────── */

export function RegisterDeviceWizard({
  open,
  onOpenChange,
  onComplete
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: (zoneId?: string) => void;
}) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [formData, setFormData] = useState<CreatePlayerForm | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (payload: CreatePendingRequest) => deviceService.createPending(payload),
    onSuccess: (result, variables) => {
      setDeviceId(result.device_id);
      setPlayerId(result.player_id ?? formatPlayerId(result.device_id));
      setFormData(variables as unknown as CreatePlayerForm);
      setStep(2);
      toast.success('Player created');
      // Immediately invalidate devices list so it appears
      queryClient.invalidateQueries({ queryKey: queryKeys.devices(variables.zone_id) });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to create player')
  });

  const handleStep1Submit = useCallback(
    (data: CreatePlayerForm) => {
      createMutation.mutate(data);
    },
    [createMutation]
  );

  const handleActivated = useCallback(() => {
    if (formData) {
      queryClient.invalidateQueries({ queryKey: queryKeys.devices(formData.zone_id) });
    }
  }, [formData, queryClient]);

  const handleDone = useCallback(() => {
    onOpenChange(false);
    onComplete(formData?.zone_id);
    setTimeout(() => {
      setStep(1);
      setFormData(null);
      setDeviceId(null);
      setPlayerId(null);
    }, 300);
  }, [onOpenChange, onComplete, formData]);

  const handleClose = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        if (step > 1) {
          onComplete(formData?.zone_id);
        }
        onOpenChange(false);
        setTimeout(() => {
          setStep(1);
          setFormData(null);
          setDeviceId(null);
          setPlayerId(null);
        }, 300);
      }
    },
    [step, onOpenChange, onComplete, formData]
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {step === 1 && 'Register new player'}
            {step === 2 && 'Install player'}
            {step === 3 && 'Activate player'}
          </DialogTitle>
          <DialogDescription>
            {step === 1 && 'Create a player record. After creation you will install and activate it.'}
            {step === 2 && 'Download and install the CampusCast Player on the target device.'}
            {step === 3 && 'Connect the installed player to the CMS.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-center py-1">
          <StepIndicator currentStep={step} />
        </div>

        <Separator />

        {step === 1 && (
          <StepCreatePlayer
            onCreated={handleStep1Submit}
            isPending={createMutation.isPending}
          />
        )}

        {step === 2 && playerId && formData && (
          <StepInstallPlayer
            playerId={playerId}
            formData={formData}
            onNext={() => setStep(3)}
          />
        )}

        {step === 3 && deviceId && playerId && formData && (
          <StepActivatePlayer
            deviceId={deviceId}
            playerId={playerId}
            formData={formData}
            onActivated={handleActivated}
            onDone={handleDone}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
