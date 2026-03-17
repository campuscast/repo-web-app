'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
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

const MIN_PASSWORD_LENGTH = 9;

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
    current_password: z.string().min(1, 'Введите текущий пароль'),
    new_password: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `Минимум ${MIN_PASSWORD_LENGTH} символов`)
      .regex(/[A-Z]/, 'Добавьте заглавную букву')
      .regex(/[a-z]/, 'Добавьте строчную букву')
      .regex(/[0-9]/, 'Добавьте цифру')
      .regex(/[^A-Za-z0-9]/, 'Добавьте спецсимвол'),
    confirm_password: z.string().min(1, 'Подтвердите новый пароль')
  })
  .refine((value) => value.new_password === value.confirm_password, {
    path: ['confirm_password'],
    message: 'Пароли не совпадают'
  });

type PasswordForm = z.infer<typeof passwordSchema>;

export function SettingsPage() {
  const [securityMode, setSecurityMode] = useState<'standard' | 'strict'>('standard');
  const [isChangingPassword, setChangingPassword] = useState(false);

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
              try {
                setChangingPassword(true);
                await changeOwnPassword({
                  current_password: values.current_password,
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
              <div className="space-y-2">
                <Label>Current password</Label>
                <Input type="password" autoComplete="current-password" {...passwordForm.register('current_password')} />
                <p className="text-xs text-destructive">{passwordForm.formState.errors.current_password?.message}</p>
              </div>
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
              Требования: минимум {MIN_PASSWORD_LENGTH} символов, заглавная и строчная буква, цифра и спецсимвол.
            </p>

            <Button type="submit" disabled={isChangingPassword}>
              {isChangingPassword ? 'Updating...' : 'Change password'}
            </Button>
          </form>
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
