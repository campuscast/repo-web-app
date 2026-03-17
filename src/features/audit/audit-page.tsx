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
import { listAuditEvents } from '@/services/audit-service';

const PAGE_SIZE = 20;

export function AuditPage() {
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
        description="Просмотр IAM audit-событий с фильтрами по типу события, пользователю и дате"
        actions={
          <Button variant="outline" onClick={() => auditQuery.refetch()} disabled={auditQuery.isFetching}>
            <RefreshCw className={`size-4 ${auditQuery.isFetching ? 'animate-spin' : ''}`} />
            Refresh
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
                placeholder="event_type"
                value={eventType}
                onChange={(event) => {
                  setEventType(event.target.value);
                  setPage(1);
                }}
              />
            </div>
            <Input
              className="w-[220px]"
              placeholder="actor_id (user id)"
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
              <TableHead className="pl-4">Time</TableHead>
              <TableHead>Event Type</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Resource</TableHead>
              <TableHead>Zone</TableHead>
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
              title="No audit events"
              description="По заданным фильтрам событий не найдено."
            />
          </div>
        ) : null}
      </DataTable>

      {auditQuery.isError ? (
        <p className="text-sm text-destructive">
          {auditQuery.error instanceof Error ? auditQuery.error.message : 'Failed to load audit events'}
        </p>
      ) : null}
    </div>
  );
}
