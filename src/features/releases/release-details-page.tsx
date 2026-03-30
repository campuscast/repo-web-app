'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { queryKeys } from '@/lib/query-keys';
import { releaseService } from '@/services/release-service';

type ReleaseDetailsPageProps = {
  releaseId: string;
};

function toneByStatus(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'active') return 'success';
  if (status === 'rolling_out' || status === 'pending') return 'warning';
  if (status === 'failed') return 'danger';
  return 'neutral';
}

export function ReleaseDetailsPage({ releaseId }: ReleaseDetailsPageProps) {
  const releaseQuery = useQuery({
    queryKey: queryKeys.release(releaseId),
    queryFn: () => releaseService.get(releaseId),
  });

  const summaryQuery = useQuery({
    queryKey: [...queryKeys.release(releaseId), 'manifest-summary'],
    queryFn: () => releaseService.getManifestSummary(releaseId),
  });

  const release = releaseQuery.data;
  const summary = summaryQuery.data || release?.manifest_summary;

  return (
    <div className="space-y-4">
      <PageHeader
        description={release ? `Release ${release.release_id}` : 'Release details'}
        actions={release ? (
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href={`/schedules/${release.schedule_id}`}>Open schedule</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/releases">Back to releases</Link>
            </Button>
          </div>
        ) : null}
      />

      <Card>
        <CardHeader>
          <CardTitle>Release metadata</CardTitle>
          <CardDescription>Реальная release-запись из schedule-service.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          {releaseQuery.isLoading ? (
            <>
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </>
          ) : release ? (
            <>
              <InfoLine label="Release ID" value={release.release_id} mono />
              <InfoLine label="Schedule ID" value={release.schedule_id} mono />
              <InfoLine label="Schedule" value={release.schedule_name || release.schedule_id} />
              <InfoLine label="Zone ID" value={release.zone_id} mono />
              <InfoLine label="Version" value={`v${release.version_number}`} />
              <div className="rounded-md border px-3 py-2">
                <div className="text-xs text-muted-foreground">Status</div>
                <div className="mt-1">
                  <StatusBadge tone={toneByStatus(release.status)} label={release.status} />
                </div>
              </div>
              <InfoLine label="Published at" value={new Date(release.published_at).toLocaleString()} />
              <InfoLine
                label="Target groups"
                value={release.target_group_ids.length ? release.target_group_ids.join(', ') : 'all devices in zone'}
              />
              <InfoLine label="Manifest present" value={release.manifest_present ? 'yes' : 'no'} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Release not found.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Manifest summary</CardTitle>
          <CardDescription>Краткая структура manifest без rollback-эмуляции.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-5">
          {summaryQuery.isLoading && !summary ? (
            Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-16 w-full" />)
          ) : summary ? (
            <>
              <InfoLine label="Slots" value={String(summary.slot_count)} />
              <InfoLine label="Assets" value={String(summary.asset_count)} />
              <InfoLine label="Publications" value={String(summary.publication_count)} />
              <InfoLine label="Hash" value={summary.manifest_hash || '—'} mono />
              <InfoLine label="Signature" value={summary.has_signature ? 'present' : 'missing'} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Manifest summary unavailable.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function InfoLine({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`break-all font-medium ${mono ? 'font-mono text-xs' : ''}`}>{value}</div>
    </div>
  );
}
