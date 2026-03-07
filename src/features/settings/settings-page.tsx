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

export function SettingsPage() {
  const [securityMode, setSecurityMode] = useState<'standard' | 'strict'>('standard');

  const form = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      workspace_name: 'CampusCast CMS',
      default_timezone: 'Europe/Moscow',
      refresh_interval_seconds: '30'
    }
  });

  return (
    <div className="space-y-4">
      <PageHeader
        description="Администрирование системных настроек CMS и политики рабочего пространства"
      />

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
