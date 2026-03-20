'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Search } from 'lucide-react';
import { DataTable } from '@/components/common/data-table';
import { EmptyState } from '@/components/common/empty-state';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useLocale } from '@/hooks/use-locale';
import { listAuditEvents } from '@/services/audit-service';

const PAGE_SIZE = 20;

export function AuditPage() {
  const { t } = useLocale();
  const [eventType, setEventType] = useState('');
  const [actorId, setActorId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);

  const auditQuery = useQuery({
    queryKey: ['audit-events', eventType, actorId, fromDate, toDate, page],
    queryFn: () =>
      listAuditEvents({
        event_type: eventType.trim() || undefined,
        actor_id: actorId.trim() || undefined,
        from: fromDate || undefined,
        to: toDate || undefined,
        page,
        page_size: PAGE_SIZE,
      }),
  });

  const events = auditQuery.data?.data ?? [];
  const total = auditQuery.data?.pagination.total ?? 0;

  return (
    <div className="space-y-4">
      <PageHeader
        description={t('audit.description')}
        actions={
          <Button variant="outline" onClick={() => auditQuery.refetch()} disabled={auditQuery.isFetching}>
            <RefreshCw className={`size-4 ${auditQuery.isFetching ? 'animate-spin' : ''}`} />
            {t('audit.refresh')}
          </Button>
        }
      />

      <DataTable
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-[240px]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder={t('audit.filterEventType')}
                value={eventType}
                onChange={(event) => {
                  setEventType(event.target.value);
                  setPage(1);
                }}
              />
            </div>
            <Input
              className="w-[220px]"
              placeholder={t('audit.filterActor')}
              value={actorId}
              onChange={(event) => {
                setActorId(event.target.value);
                setPage(1);
              }}
            />
            <Input
              className="w-[180px]"
              type="date"
              value={fromDate}
              onChange={(event) => {
                setFromDate(event.target.value);
                setPage(1);
              }}
            />
            <Input
              className="w-[180px]"
              type="date"
              value={toDate}
              onChange={(event) => {
                setToDate(event.target.value);
                setPage(1);
              }}
            />
          </div>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">{t('audit.time')}</TableHead>
              <TableHead>{t('audit.eventType')}</TableHead>
              <TableHead>{t('audit.actor')}</TableHead>
              <TableHead>{t('audit.action')}</TableHead>
              <TableHead>{t('audit.resource')}</TableHead>
              <TableHead>{t('audit.zone')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((event) => (
              <TableRow key={event.event_id}>
                <TableCell className="pl-4">{new Date(event.timestamp).toLocaleString()}</TableCell>
                <TableCell className="font-mono text-xs">{event.event_type}</TableCell>
                <TableCell className="font-mono text-xs">{event.actor_id || '-'}</TableCell>
                <TableCell>{event.action || '-'}</TableCell>
                <TableCell className="text-xs">
                  {[event.resource_type || 'resource', event.resource_id || '-'].join('/')}
                </TableCell>
                <TableCell className="font-mono text-xs">{event.zone_id || '-'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {!auditQuery.isLoading && !events.length ? (
          <div className="p-4">
            <EmptyState
              title={t('audit.emptyTitle')}
              description={t('audit.emptyDescription')}
            />
          </div>
        ) : null}
      </DataTable>

      {auditQuery.isError ? (
        <p className="text-sm text-destructive">
          {auditQuery.error instanceof Error ? auditQuery.error.message : t('audit.error')}
        </p>
      ) : null}
    </div>
  );
}
