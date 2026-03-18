'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { useAuthStore } from '@/auth/store';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { changeOwnPassword } from '@/services/user-admin-service';
import {
  disableMfa,
  enableMfa,
  getMfaStatus,
  startMfaSetup,
  verifyMfaCode,
} from '@/services/mfa-service';
import type { MfaSetup } from '@/types/api';

const MIN_PASSWORD_LENGTH = 8;

const settingsSchema = z.object({
  workspace_name: z.string().min(2, 'Введите имя workspace'),
  default_timezone: z.string().min(1, 'Выберите timezone'),
  refresh_interval_seconds: z
    .string()
    .min(1, 'Введите интервал')
    .refine((value) => Number.isInteger(Number(value)) && Number(value) >= 5 && Number(value) <= 300, {
      message: 'Значение от 5 до 300'
    })
});

type SettingsForm = z.infer<typeof settingsSchema>;

const passwordSchema = z
  .object({
    current_password: z.string().optional(),
    new_password: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `Минимум ${MIN_PASSWORD_LENGTH} символов`),
    confirm_password: z.string().min(1, 'Подтвердите новый пароль')
  })
  .refine((value) => value.new_password === value.confirm_password, {
    path: ['confirm_password'],
    message: 'Пароли не совпадают'
  });

type PasswordForm = z.infer<typeof passwordSchema>;

export function SettingsPage() {
  const currentUser = useAuthStore((state) => state.user);
  const mustChangePassword = Boolean(currentUser?.must_change_password);
  const [securityMode, setSecurityMode] = useState<'standard' | 'strict'>('standard');
  const [isChangingPassword, setChangingPassword] = useState(false);
  const [mfaStatus, setMfaStatus] = useState<{ mfa_enabled: boolean; has_secret: boolean }>({
    mfa_enabled: false,
    has_secret: false,
  });
  const [mfaSetup, setMfaSetup] = useState<MfaSetup | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaCodeVerified, setMfaCodeVerified] = useState(false);
  const [mfaDisablePassword, setMfaDisablePassword] = useState('');
  const [mfaBusy, setMfaBusy] = useState(false);

  const form = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      workspace_name: 'CampusCast CMS',
      default_timezone: 'Europe/Moscow',
      refresh_interval_seconds: '30'
    }
  });

  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      current_password: '',
      new_password: '',
      confirm_password: ''
    }
  });

  useEffect(() => {
    let active = true;
    getMfaStatus()
      .then((status) => {
        if (active) {
          setMfaStatus(status);
        }
      })
      .catch(() => {
        if (active) {
          setMfaStatus({ mfa_enabled: false, has_secret: false });
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const reloadMfaStatus = async () => {
    const status = await getMfaStatus();
    setMfaStatus(status);
    return status;
  };

  const handleStartMfaSetup = async () => {
    try {
      setMfaBusy(true);
      const setup = await startMfaSetup();
      setMfaSetup(setup);
      setMfaCode('');
      setMfaCodeVerified(false);
      toast.success('MFA setup initialized');
      await reloadMfaStatus();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to initialize MFA setup');
    } finally {
      setMfaBusy(false);
    }
  };

  const handleVerifyMfaCode = async () => {
    if (!mfaCode.trim()) {
      toast.error('Enter authenticator code');
      return;
    }
    try {
      setMfaBusy(true);
      await verifyMfaCode(mfaCode.trim());
      setMfaCodeVerified(true);
      toast.success('MFA code is valid');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Invalid MFA code');
    } finally {
      setMfaBusy(false);
    }
  };

  const handleEnableMfa = async () => {
    if (!mfaCode.trim()) {
      toast.error('Enter authenticator code');
      return;
    }
    try {
      setMfaBusy(true);
      await enableMfa(mfaCode.trim());
      setMfaSetup(null);
      setMfaCode('');
      setMfaCodeVerified(false);
      await reloadMfaStatus();
      toast.success('MFA enabled');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to enable MFA');
    } finally {
      setMfaBusy(false);
    }
  };

  const handleDisableMfa = async () => {
    if (!mfaDisablePassword) {
      toast.error('Enter current password');
      return;
    }
    try {
      setMfaBusy(true);
      await disableMfa(mfaDisablePassword);
      setMfaDisablePassword('');
      setMfaSetup(null);
      setMfaCode('');
      setMfaCodeVerified(false);
      await reloadMfaStatus();
      toast.success('MFA disabled');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to disable MFA');
    } finally {
      setMfaBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        description="Администрирование системных настроек CMS и политики рабочего пространства"
      />

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>Обновление пароля текущего пользователя</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={passwordForm.handleSubmit(async (values) => {
              if (!mustChangePassword && !values.current_password) {
                passwordForm.setError('current_password', { message: 'Введите текущий пароль' });
                return;
              }
              try {
                setChangingPassword(true);
                await changeOwnPassword({
                  current_password: mustChangePassword ? undefined : values.current_password,
                  new_password: values.new_password
                });
                passwordForm.reset({
                  current_password: '',
                  new_password: '',
                  confirm_password: ''
                });
                toast.success('Password updated successfully');
              } catch (error) {
                toast.error(error instanceof Error ? error.message : 'Failed to update password');
              } finally {
                setChangingPassword(false);
              }
            })}
          >
            <div className="grid gap-4 md:grid-cols-2">
              {!mustChangePassword ? (
                <div className="space-y-2">
                  <Label>Current password</Label>
                  <Input type="password" autoComplete="current-password" {...passwordForm.register('current_password')} />
                  <p className="text-xs text-destructive">{passwordForm.formState.errors.current_password?.message}</p>
                </div>
              ) : null}
              <div className="space-y-2">
                <Label>New password</Label>
                <Input type="password" autoComplete="new-password" {...passwordForm.register('new_password')} />
                <p className="text-xs text-destructive">{passwordForm.formState.errors.new_password?.message}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Confirm new password</Label>
              <Input type="password" autoComplete="new-password" {...passwordForm.register('confirm_password')} className="max-w-md" />
              <p className="text-xs text-destructive">{passwordForm.formState.errors.confirm_password?.message}</p>
            </div>

            <p className="text-xs text-muted-foreground">
              Требования: минимум {MIN_PASSWORD_LENGTH} символов.
            </p>

            <Button type="submit" disabled={isChangingPassword}>
              {isChangingPassword ? 'Updating...' : 'Change password'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>MFA (TOTP)</CardTitle>
          <CardDescription>Two-factor authentication with authenticator app</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Status: {mfaStatus.mfa_enabled ? 'Enabled' : 'Disabled'}
          </p>

          {!mfaStatus.mfa_enabled ? (
            <div className="space-y-3">
              <Button variant="outline" onClick={handleStartMfaSetup} disabled={mfaBusy}>
                {mfaBusy ? 'Preparing...' : 'Initiate MFA setup'}
              </Button>

              {mfaSetup ? (
                <div className="space-y-3 rounded-md border p-3">
                  <div className="space-y-1">
                    <Label>Setup secret</Label>
                    <code className="block rounded bg-muted p-2 text-xs select-all">{mfaSetup.secret}</code>
                  </div>
                  <div className="space-y-1">
                    <Label>otpauth URI (QR payload)</Label>
                    <code className="block rounded bg-muted p-2 text-xs select-all break-all">{mfaSetup.otpauth_uri}</code>
                  </div>

                  <div className="space-y-2">
                    <Label>Authenticator code</Label>
                    <Input
                      placeholder="123456"
                      value={mfaCode}
                      onChange={(event) => {
                        setMfaCode(event.target.value);
                        setMfaCodeVerified(false);
                      }}
                      inputMode="numeric"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={handleVerifyMfaCode} disabled={mfaBusy}>
                      Verify code
                    </Button>
                    <Button onClick={handleEnableMfa} disabled={mfaBusy || !mfaCodeVerified}>
                      Enable MFA
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3 rounded-md border p-3">
              <p className="text-sm text-muted-foreground">
                MFA is enabled. Enter password to disable.
              </p>
              <div className="space-y-2">
                <Label>Current password</Label>
                <Input
                  type="password"
                  value={mfaDisablePassword}
                  onChange={(event) => setMfaDisablePassword(event.target.value)}
                  autoComplete="current-password"
                />
              </div>
              <Button variant="destructive" onClick={handleDisableMfa} disabled={mfaBusy}>
                Disable MFA
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Workspace configuration</CardTitle>
            <CardDescription>Базовые параметры интерфейса и обновления данных</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={form.handleSubmit((values) => {
                toast.success(
                  `Settings saved for ${values.workspace_name} (${Number(values.refresh_interval_seconds)}s refresh)`
                );
              })}
            >
              <div className="space-y-2">
                <Label>Workspace name</Label>
                <Input {...form.register('workspace_name')} className="max-w-md" />
                <p className="text-xs text-destructive">{form.formState.errors.workspace_name?.message}</p>
              </div>

              <div className="space-y-2">
                <Label>Default timezone</Label>
                <Select
                  value={form.watch('default_timezone')}
                  onValueChange={(value) => form.setValue('default_timezone', value, { shouldValidate: true })}
                >
                  <SelectTrigger className="max-w-md">
                    <SelectValue placeholder="Select timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Europe/Moscow">Europe/Moscow</SelectItem>
                    <SelectItem value="Europe/Berlin">Europe/Berlin</SelectItem>
                    <SelectItem value="UTC">UTC</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>UI refresh interval (seconds)</Label>
                <Input type="number" {...form.register('refresh_interval_seconds')} className="max-w-40" />
                <p className="text-xs text-destructive">{form.formState.errors.refresh_interval_seconds?.message}</p>
              </div>

              <Button type="submit">Save workspace settings</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Security and rollout policy</CardTitle>
            <CardDescription>Контроль поведения публикаций и ручных операций операторов</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Security preset</Label>
              <Select value={securityMode} onValueChange={(value) => setSecurityMode(value as typeof securityMode)}>
                <SelectTrigger className="max-w-md">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="strict">Strict</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div className="space-y-2 text-sm text-muted-foreground">
              <p>Current mode: {securityMode === 'strict' ? 'Strict controls enabled' : 'Standard controls enabled'}.</p>
              <p>
                В режиме Strict публикации и batch-операции должны проходить через усиленные QA и signature-проверки.
              </p>
            </div>

            <Button
              variant="outline"
              onClick={() => toast.success(`Security mode switched to ${securityMode}`)}
            >
              Apply security mode
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
