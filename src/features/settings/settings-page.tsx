'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Globe } from 'lucide-react';
import { useAuthStore } from '@/auth/store';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLocale } from '@/hooks/use-locale';
import { type Locale } from '@/lib/i18n';
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

type SettingsForm = {
  workspace_name: string;
  default_timezone: string;
  refresh_interval_seconds: string;
};

type PasswordForm = {
  current_password?: string;
  new_password: string;
  confirm_password: string;
};

const LOCALES: Array<{ value: Locale; labelKey: string }> = [
  { value: 'en', labelKey: 'settings.web.localeEnglish' },
  { value: 'ru', labelKey: 'settings.web.localeRussian' },
];

export function SettingsPage() {
  const { t, locale, changeLocale } = useLocale();
  const currentUser = useAuthStore((state) => state.user);
  const mustChangePassword = Boolean(currentUser?.must_change_password);
  const [securityMode, setSecurityMode] = useState<'standard' | 'strict'>(
    'standard',
  );
  const [isChangingPassword, setChangingPassword] = useState(false);
  const [mfaStatus, setMfaStatus] = useState<{
    mfa_enabled: boolean;
    has_secret: boolean;
  }>({
    mfa_enabled: false,
    has_secret: false,
  });
  const [mfaSetup, setMfaSetup] = useState<MfaSetup | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaCodeVerified, setMfaCodeVerified] = useState(false);
  const [mfaDisablePassword, setMfaDisablePassword] = useState('');
  const [mfaBusy, setMfaBusy] = useState(false);

  const settingsSchema = useMemo(
    () =>
      z.object({
        workspace_name: z
          .string()
          .min(2, t('settings.web.workspaceNameRequired')),
        default_timezone: z
          .string()
          .min(1, t('settings.web.timezoneRequired')),
        refresh_interval_seconds: z
          .string()
          .min(1, t('settings.web.intervalRequired'))
          .refine(
            (value) =>
              Number.isInteger(Number(value)) &&
              Number(value) >= 5 &&
              Number(value) <= 300,
            {
              message: t('settings.web.intervalRange'),
            },
          ),
      }),
    [t],
  );

  const passwordSchema = useMemo(
    () =>
      z
        .object({
          current_password: z.string().optional(),
          new_password: z
            .string()
            .min(
              MIN_PASSWORD_LENGTH,
              t('settings.web.passwordMin', { min: MIN_PASSWORD_LENGTH }),
            ),
          confirm_password: z
            .string()
            .min(1, t('settings.web.passwordConfirmRequired')),
        })
        .refine((value) => value.new_password === value.confirm_password, {
          path: ['confirm_password'],
          message: t('settings.web.passwordMismatch'),
        }),
    [t],
  );

  const form = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      workspace_name: 'CampusCast CMS',
      default_timezone: 'Europe/Moscow',
      refresh_interval_seconds: '30',
    },
  });

  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      current_password: '',
      new_password: '',
      confirm_password: '',
    },
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
      toast.success(t('settings.web.toast.mfaSetupInitialized'));
      await reloadMfaStatus();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('settings.web.toast.mfaSetupFailed'),
      );
    } finally {
      setMfaBusy(false);
    }
  };

  const handleVerifyMfaCode = async () => {
    if (!mfaCode.trim()) {
      toast.error(t('settings.web.mfaCodeRequired'));
      return;
    }
    try {
      setMfaBusy(true);
      await verifyMfaCode(mfaCode.trim());
      setMfaCodeVerified(true);
      toast.success(t('settings.web.toast.mfaCodeValid'));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('settings.web.toast.mfaCodeInvalid'),
      );
    } finally {
      setMfaBusy(false);
    }
  };

  const handleEnableMfa = async () => {
    if (!mfaCode.trim()) {
      toast.error(t('settings.web.mfaCodeRequired'));
      return;
    }
    try {
      setMfaBusy(true);
      await enableMfa(mfaCode.trim());
      setMfaSetup(null);
      setMfaCode('');
      setMfaCodeVerified(false);
      await reloadMfaStatus();
      toast.success(t('settings.web.toast.mfaEnabled'));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('settings.web.toast.mfaEnableFailed'),
      );
    } finally {
      setMfaBusy(false);
    }
  };

  const handleDisableMfa = async () => {
    if (!mfaDisablePassword) {
      toast.error(t('settings.web.mfaPasswordRequired'));
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
      toast.success(t('settings.web.toast.mfaDisabled'));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('settings.web.toast.mfaDisableFailed'),
      );
    } finally {
      setMfaBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader description={t('settings.web.description')} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="size-4" />
            {t('settings.web.languageTitle')}
          </CardTitle>
          <CardDescription>
            {t('settings.web.languageDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            {LOCALES.map((option) => (
              <Button
                key={option.value}
                variant={locale === option.value ? 'default' : 'outline'}
                onClick={() => changeLocale(option.value)}
              >
                {t(option.labelKey)}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.web.changePasswordTitle')}</CardTitle>
          <CardDescription>
            {t('settings.web.changePasswordDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={passwordForm.handleSubmit(async (values) => {
              if (!mustChangePassword && !values.current_password) {
                passwordForm.setError('current_password', {
                  message: t('settings.web.passwordRequired'),
                });
                return;
              }
              try {
                setChangingPassword(true);
                await changeOwnPassword({
                  current_password: mustChangePassword
                    ? undefined
                    : values.current_password,
                  new_password: values.new_password,
                });
                passwordForm.reset({
                  current_password: '',
                  new_password: '',
                  confirm_password: '',
                });
                toast.success(t('settings.web.toast.passwordUpdated'));
              } catch (error) {
                toast.error(
                  error instanceof Error
                    ? error.message
                    : t('settings.web.toast.passwordUpdateFailed'),
                );
              } finally {
                setChangingPassword(false);
              }
            })}
          >
            <div className="grid gap-4 md:grid-cols-2">
              {!mustChangePassword ? (
                <div className="space-y-2">
                  <Label>{t('settings.web.currentPassword')}</Label>
                  <Input
                    type="password"
                    autoComplete="current-password"
                    {...passwordForm.register('current_password')}
                  />
                  <p className="text-xs text-destructive">
                    {passwordForm.formState.errors.current_password?.message}
                  </p>
                </div>
              ) : null}
              <div className="space-y-2">
                <Label>{t('settings.web.newPassword')}</Label>
                <Input
                  type="password"
                  autoComplete="new-password"
                  {...passwordForm.register('new_password')}
                />
                <p className="text-xs text-destructive">
                  {passwordForm.formState.errors.new_password?.message}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('settings.web.confirmNewPassword')}</Label>
              <Input
                type="password"
                autoComplete="new-password"
                {...passwordForm.register('confirm_password')}
                className="max-w-md"
              />
              <p className="text-xs text-destructive">
                {passwordForm.formState.errors.confirm_password?.message}
              </p>
            </div>

            <p className="text-xs text-muted-foreground">
              {t('settings.web.passwordRequirements', {
                min: MIN_PASSWORD_LENGTH,
              })}
            </p>

            <Button type="submit" disabled={isChangingPassword}>
              {isChangingPassword
                ? t('settings.web.updating')
                : t('settings.web.changePassword')}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.web.mfaTitle')}</CardTitle>
          <CardDescription>{t('settings.web.mfaDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t('settings.web.mfaStatus', {
              status: mfaStatus.mfa_enabled
                ? t('settings.web.mfaEnabled')
                : t('settings.web.mfaDisabled'),
            })}
          </p>

          {!mfaStatus.mfa_enabled ? (
            <div className="space-y-3">
              <Button
                variant="outline"
                onClick={handleStartMfaSetup}
                disabled={mfaBusy}
              >
                {mfaBusy
                  ? t('settings.web.mfaPreparing')
                  : t('settings.web.mfaInitiate')}
              </Button>

              {mfaSetup ? (
                <div className="space-y-3 rounded-md border p-3">
                  <div className="space-y-1">
                    <Label>{t('settings.web.mfaSetupSecret')}</Label>
                    <code className="block rounded bg-muted p-2 text-xs select-all">
                      {mfaSetup.secret}
                    </code>
                  </div>
                  <div className="space-y-1">
                    <Label>{t('settings.web.mfaOtpAuthUri')}</Label>
                    <code className="block rounded bg-muted p-2 text-xs select-all break-all">
                      {mfaSetup.otpauth_uri}
                    </code>
                  </div>

                  <div className="space-y-2">
                    <Label>{t('settings.web.mfaCode')}</Label>
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
                    <Button
                      variant="outline"
                      onClick={handleVerifyMfaCode}
                      disabled={mfaBusy}
                    >
                      {t('settings.web.mfaVerifyCode')}
                    </Button>
                    <Button
                      onClick={handleEnableMfa}
                      disabled={mfaBusy || !mfaCodeVerified}
                    >
                      {t('settings.web.mfaEnable')}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3 rounded-md border p-3">
              <p className="text-sm text-muted-foreground">
                {t('settings.web.mfaDisableInfo')}
              </p>
              <div className="space-y-2">
                <Label>{t('settings.web.currentPassword')}</Label>
                <Input
                  type="password"
                  value={mfaDisablePassword}
                  onChange={(event) => setMfaDisablePassword(event.target.value)}
                  autoComplete="current-password"
                />
              </div>
              <Button
                variant="destructive"
                onClick={handleDisableMfa}
                disabled={mfaBusy}
              >
                {t('settings.web.mfaDisable')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.web.workspaceTitle')}</CardTitle>
            <CardDescription>
              {t('settings.web.workspaceDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={form.handleSubmit((values) => {
                toast.success(
                  t('settings.web.toast.workspaceSaved', {
                    workspace: values.workspace_name,
                    seconds: Number(values.refresh_interval_seconds),
                  }),
                );
              })}
            >
              <div className="space-y-2">
                <Label>{t('settings.web.workspaceName')}</Label>
                <Input
                  {...form.register('workspace_name')}
                  className="max-w-md"
                />
                <p className="text-xs text-destructive">
                  {form.formState.errors.workspace_name?.message}
                </p>
              </div>

              <div className="space-y-2">
                <Label>{t('settings.web.defaultTimezone')}</Label>
                <Select
                  value={form.watch('default_timezone')}
                  onValueChange={(value) =>
                    form.setValue('default_timezone', value, {
                      shouldValidate: true,
                    })
                  }
                >
                  <SelectTrigger className="max-w-md">
                    <SelectValue placeholder={t('settings.web.selectTimezone')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Europe/Moscow">Europe/Moscow</SelectItem>
                    <SelectItem value="Europe/Berlin">Europe/Berlin</SelectItem>
                    <SelectItem value="UTC">UTC</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t('settings.web.refreshInterval')}</Label>
                <Input
                  type="number"
                  {...form.register('refresh_interval_seconds')}
                  className="max-w-40"
                />
                <p className="text-xs text-destructive">
                  {form.formState.errors.refresh_interval_seconds?.message}
                </p>
              </div>

              <Button type="submit">{t('settings.web.saveWorkspace')}</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('settings.web.securityTitle')}</CardTitle>
            <CardDescription>
              {t('settings.web.securityDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>{t('settings.web.securityPreset')}</Label>
              <Select
                value={securityMode}
                onValueChange={(value) =>
                  setSecurityMode(value as typeof securityMode)
                }
              >
                <SelectTrigger className="max-w-md">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">
                    {t('settings.web.securityStandard')}
                  </SelectItem>
                  <SelectItem value="strict">
                    {t('settings.web.securityStrict')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                {t('settings.web.currentMode', {
                  mode:
                    securityMode === 'strict'
                      ? t('settings.web.strictMode')
                      : t('settings.web.standardMode'),
                })}
              </p>
              <p>{t('settings.web.strictDescription')}</p>
            </div>

            <Button
              variant="outline"
              onClick={() =>
                toast.success(
                  t('settings.web.toast.securitySwitched', {
                    mode: securityMode,
                  }),
                )
              }
            >
              {t('settings.web.applySecurityMode')}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
