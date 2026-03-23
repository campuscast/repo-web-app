'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RotateCw, Trash2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { useAuthStore } from '@/auth/store';
import { hasRole } from '@/auth/guards';
import { PageHeader } from '@/components/common/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useLocale } from '@/hooks/use-locale';
import { publicationService } from '@/services/publication-service';
import { scheduleService } from '@/services/schedule-service';
import { zoneService } from '@/services/zone-service';
import type { Publication, Zone } from '@/types/api';

export function PublicationsManager() {
  const { t } = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();

  const roles = useAuthStore((state) => state.roles);
  const allowedZones = useAuthStore((state) => state.zones);
  const hasPermission = useAuthStore((state) => state.hasPermission);

  const isAdmin = hasRole(roles, 'admin') || hasRole(roles, 'super_admin');
  const canRead = isAdmin || hasPermission('content.read');
  const canWrite = isAdmin || hasPermission('content.write');

  const [zones, setZones] = useState<Zone[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState(searchParams.get('zone_id') || '');
  const [publications, setPublications] = useState<Publication[]>([]);
  const [usageByPublicationId, setUsageByPublicationId] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const visibleZones = useMemo(() => {
    if (isAdmin) return zones;
    return zones.filter((zone) => allowedZones.includes(zone.zone_id));
  }, [allowedZones, isAdmin, zones]);

  const loadZoneData = useCallback(async (zoneId: string) => {
    if (!zoneId) {
      setPublications([]);
      setUsageByPublicationId({});
      return;
    }

    const [publicationRows, usage] = await Promise.all([
      publicationService.list(zoneId),
      scheduleService.getUsage(zoneId),
    ]);

    setPublications(publicationRows);
    setUsageByPublicationId(usage.publications);
  }, []);

  const load = useCallback(async () => {
    if (!canRead) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const allZones = await zoneService.listZones();
      setZones(allZones);

      const availableZones = isAdmin
        ? allZones
        : allZones.filter((zone) => allowedZones.includes(zone.zone_id));
      const effectiveZoneId = selectedZoneId || searchParams.get('zone_id') || availableZones[0]?.zone_id || '';

      if (!selectedZoneId && effectiveZoneId) {
        setSelectedZoneId(effectiveZoneId);
      }

      await loadZoneData(effectiveZoneId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('publications.toast.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [allowedZones, canRead, isAdmin, loadZoneData, searchParams, selectedZoneId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedZoneId || !canRead) return;

    void (async () => {
      try {
        await loadZoneData(selectedZoneId);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t('publications.toast.refreshZoneFailed'));
      }
    })();
  }, [canRead, loadZoneData, selectedZoneId, t]);

  const openCreate = () => {
    if (!selectedZoneId) {
      toast.error(t('publications.toast.selectZoneFirst'));
      return;
    }
    router.push(`/publications/new?zone_id=${encodeURIComponent(selectedZoneId)}`);
  };

  const openEdit = (publication: Publication) => {
    const zoneId = publication.zone_id || selectedZoneId;
    const query = zoneId ? `?zone_id=${encodeURIComponent(zoneId)}` : '';
    router.push(`/publications/${publication.publication_id}${query}`);
  };

  const archivePublication = async (publicationId: string) => {
    try {
      await publicationService.archive(publicationId);
      toast.success(t('publications.toast.archived'));
      await loadZoneData(selectedZoneId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('publications.toast.archiveFailed'));
    }
  };

  if (!canRead) {
    return (
      <div className="space-y-4">
        <PageHeader description={t('publications.description')} />
        <p className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {t('publications.noPermission')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        description={t('publications.description')}
        actions={
          canWrite ? (
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-1.5 size-4" />
              {t('publications.create')}
            </Button>
          ) : null
        }
      />

      <div className="flex items-center gap-3">
        <Select value={selectedZoneId} onValueChange={setSelectedZoneId}>
          <SelectTrigger className="w-[280px]">
            <SelectValue placeholder={t('publications.selectZone')} />
          </SelectTrigger>
          <SelectContent>
            {visibleZones.map((zone) => (
              <SelectItem key={zone.zone_id} value={zone.zone_id}>
                {zone.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="outline" size="icon" onClick={() => void load()} disabled={loading}>
          <RotateCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('publications.title')}</TableHead>
              <TableHead>{t('publications.type')}</TableHead>
              <TableHead>{t('publications.status')}</TableHead>
              <TableHead>{t('publications.version')}</TableHead>
              <TableHead>{t('publications.items')}</TableHead>
              <TableHead>{t('publications.usedInSlots')}</TableHead>
              {canWrite && <TableHead className="text-right">{t('publications.actions')}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {publications.map((publication) => (
              <TableRow key={publication.publication_id}>
                <TableCell className="font-medium">{publication.title}</TableCell>
                <TableCell>{publication.type}</TableCell>
                <TableCell>
                  <Badge variant={publication.status === 'active' ? 'default' : 'outline'}>
                    {publication.status}
                  </Badge>
                </TableCell>
                <TableCell>{publication.version}</TableCell>
                <TableCell>{publication.items.length}</TableCell>
                <TableCell>{usageByPublicationId[publication.publication_id] ?? 0}</TableCell>
                {canWrite ? (
                  <TableCell className="space-x-2 text-right">
                    <Button variant="outline" size="sm" onClick={() => openEdit(publication)}>
                      {t('publications.edit')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title={t('publications.archive')}
                      onClick={() => void archivePublication(publication.publication_id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
            {!loading && publications.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canWrite ? 7 : 6} className="py-8 text-center text-muted-foreground">
                  {t('publications.empty')}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
