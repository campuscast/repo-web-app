'use client';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Search } from 'lucide-react';
import { DataTable } from '@/components/common/data-table';
import { EmptyState } from '@/components/common/empty-state';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type AuditEvent = {
  id: string;
  happened_at: string;
  actor: string;
  action: string;
  target: string;
  severity: 'info' | 'warning' | 'error';
};

const createAuditSchema = z.object({
  actor: z.string().min(2, 'Введите actor'),
  action: z.string().min(2, 'Введите action'),
  target: z.string().min(2, 'Введите target'),
  severity: z.enum(['info', 'warning', 'error'])
});

type CreateAuditForm = z.infer<typeof createAuditSchema>;

export function AuditPage() {
  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState<'all' | 'info' | 'warning' | 'error'>('all');
  const [page, setPage] = useState(1);
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [events, setEvents] = useState<AuditEvent[]>([]);

  const form = useForm<CreateAuditForm>({
    resolver: zodResolver(createAuditSchema),
    defaultValues: {
      actor: 'operator',
      action: '',
      target: '',
      severity: 'info'
    }
  });

  const filtered = useMemo(() => {
    const lowered = search.toLowerCase();
    return events.filter((event) => {
      const matchSearch =
        event.actor.toLowerCase().includes(lowered) ||
        event.action.toLowerCase().includes(lowered) ||
        event.target.toLowerCase().includes(lowered);
      const matchSeverity = severity === 'all' || event.severity === severity;
      return matchSearch && matchSeverity;
    });
  }, [events, search, severity]);

  const pageSize = 12;
  const total = filtered.length;
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-4">
      <PageHeader
        description="Таблица audit events и фильтры для расследования действий пользователей"
        actions={
          <Dialog open={isCreateOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4" />
                Add event
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add audit event</DialogTitle>
                <DialogDescription>Ручное добавление события в журнал аудита (локальный режим).</DialogDescription>
              </DialogHeader>
              <form
                className="space-y-3"
                onSubmit={form.handleSubmit((values) => {
                  setEvents((prev) => [
                    {
                      id: crypto.randomUUID(),
                      happened_at: new Date().toISOString(),
                      actor: values.actor,
                      action: values.action,
                      target: values.target,
                      severity: values.severity
                    },
                    ...prev
                  ]);
                  setCreateOpen(false);
                  form.reset({ actor: values.actor, action: '', target: '', severity: 'info' });
                })}
              >
                <div className="space-y-2">
                  <Label>Actor</Label>
                  <Input {...form.register('actor')} />
                  <p className="text-xs text-destructive">{form.formState.errors.actor?.message}</p>
                </div>

                <div className="space-y-2">
                  <Label>Action</Label>
                  <Input {...form.register('action')} />
                  <p className="text-xs text-destructive">{form.formState.errors.action?.message}</p>
                </div>

                <div className="space-y-2">
                  <Label>Target</Label>
                  <Input {...form.register('target')} />
                  <p className="text-xs text-destructive">{form.formState.errors.target?.message}</p>
                </div>

                <div className="space-y-2">
                  <Label>Severity</Label>
                  <Select
                    value={form.watch('severity')}
                    onValueChange={(value) => form.setValue('severity', value as CreateAuditForm['severity'])}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="info">info</SelectItem>
                      <SelectItem value="warning">warning</SelectItem>
                      <SelectItem value="error">error</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <DialogFooter>
                  <Button type="submit">Add event</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <DataTable
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="shrink-0 text-sm text-muted-foreground">Severity:</span>
              <Select value={severity} onValueChange={(value) => setSeverity(value as typeof severity)}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All severities</SelectItem>
                  <SelectItem value="info">info</SelectItem>
                  <SelectItem value="warning">warning</SelectItem>
                  <SelectItem value="error">error</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="relative w-[260px]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search event"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Time</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Severity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.map((event) => (
              <TableRow key={event.id}>
                <TableCell className="pl-4">{new Date(event.happened_at).toLocaleString()}</TableCell>
                <TableCell>{event.actor}</TableCell>
                <TableCell>{event.action}</TableCell>
                <TableCell>{event.target}</TableCell>
                <TableCell>
                  <StatusBadge
                    tone={event.severity === 'error' ? 'danger' : event.severity === 'warning' ? 'warning' : 'neutral'}
                    label={event.severity}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {!total ? (
          <div className="p-4">
            <EmptyState
              title="No audit events yet"
              description="Добавьте первое событие через кнопку Add event, чтобы заполнить журнал."
            />
          </div>
        ) : null}
      </DataTable>

      <p className="text-xs text-muted-foreground">TODO: connect to backend `/audit/events` once contract is published.</p>
    </div>
  );
}
