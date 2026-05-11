'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, Plus, RotateCcw, RotateCw, Trash2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { useAuthStore } from '@/auth/store';
import { hasRole } from '@/auth/guards';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLocale } from '@/hooks/use-locale';
import { publicationService } from '@/services/publication-service';
import { scheduleService } from '@/services/schedule-service';
import { zoneService } from '@/services/zone-service';
import type { Publication, Zone } from '@/types/api';

const ALL_ZONES_VALUE = '__all_zones__';
const PUBLICATION_TYPE_OPTIONS = [{ value: 'slideshow', label: 'Slideshow' }] as const;

type PublicationListMode = 'current' | 'archived';

function statusFilterForMode(mode: PublicationListMode) {
  return mode === 'archived' ? 'archived' : undefined;
}

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
  const [selectedZoneId, setSelectedZoneId] = useState(searchParams.get('zone_id') || ALL_ZONES_VALUE);
  const [listMode, setListMode] = useState<PublicationListMode>(
    searchParams.get('status') === 'archived' ? 'archived' : 'current',
  );
  const [publications, setPublications] = useState<Publication[]>([]);
  const [usageByPublicationId, setUsageByPublicationId] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createZoneId, setCreateZoneId] = useState('');
  const [createType, setCreateType] = useState<string>(PUBLICATION_TYPE_OPTIONS[0].value);
  const [deleteTarget, setDeleteTarget] = useState<Publication | null>(null);
  const [actionPublicationId, setActionPublicationId] = useState<string | null>(null);

  const visibleZones = useMemo(() => {
    if (isAdmin) return zones;
    return zones.filter((zone) => allowedZones.includes(zone.zone_id));
  }, [allowedZones, isAdmin, zones]);

  const activeZoneFilter = useMemo(() => {
    if (selectedZoneId === ALL_ZONES_VALUE) {
      return ALL_ZONES_VALUE;
    }

    return visibleZones.some((zone) => zone.zone_id === selectedZoneId)
      ? selectedZoneId
      : ALL_ZONES_VALUE;
  }, [selectedZoneId, visibleZones]);

  const activeStatusFilter = useMemo(() => statusFilterForMode(listMode), [listMode]);

  const loadZoneData = useCallback(async (
    zoneId: string,
    availableZones: Zone[],
    status?: string,
  ) => {
    if (!zoneId || (zoneId === ALL_ZONES_VALUE && !availableZones.length)) {
      setPublications([]);
      setUsageByPublicationId({});
      return;
    }

    if (zoneId === ALL_ZONES_VALUE) {
      const zoneData = await Promise.all(
        availableZones.map(async (zone) => {
          const [publicationRows, usage] = await Promise.all([
            publicationService.list(zone.zone_id, { status }),
            scheduleService.getUsage(zone.zone_id),
          ]);

          return { publicationRows, usage: usage.publications };
        }),
      );

      setPublications(zoneData.flatMap((entry) => entry.publicationRows));
      setUsageByPublicationId(
        zoneData.reduce<Record<string, number>>((acc, entry) => {
          for (const [publicationId, usageCount] of Object.entries(entry.usage)) {
            acc[publicationId] = usageCount;
          }
          return acc;
        }, {}),
      );
      return;
    }

    const [publicationRows, usage] = await Promise.all([
      publicationService.list(zoneId, { status }),
      scheduleService.getUsage(zoneId),
    ]);

    setPublications(publicationRows);
    setUsageByPublicationId(usage.publications);
  }, []);

  const refreshCurrentList = useCallback(async () => {
    await loadZoneData(activeZoneFilter, visibleZones, activeStatusFilter);
  }, [activeStatusFilter, activeZoneFilter, loadZoneData, visibleZones]);

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
      const requestedZoneId = selectedZoneId || searchParams.get('zone_id') || ALL_ZONES_VALUE;
      const effectiveZoneId = requestedZoneId === ALL_ZONES_VALUE || availableZones.some((zone) => zone.zone_id === requestedZoneId)
        ? requestedZoneId
        : ALL_ZONES_VALUE;

      if (selectedZoneId !== effectiveZoneId) {
        setSelectedZoneId(effectiveZoneId);
      }

      await loadZoneData(effectiveZoneId, availableZones, activeStatusFilter);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('publications.toast.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [activeStatusFilter, allowedZones, canRead, isAdmin, loadZoneData, searchParams, selectedZoneId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!canRead) return;
    setPage(1);
    setLoading(true);

    void (async () => {
      try {
        await loadZoneData(activeZoneFilter, visibleZones, activeStatusFilter);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t('publications.toast.refreshZoneFailed'));
      } finally {
        setLoading(false);
      }
    })();
  }, [activeStatusFilter, activeZoneFilter, canRead, loadZoneData, t, visibleZones]);

  const runPublicationAction = useCallback(async (
    publicationId: string,
    operation: () => Promise<boolean>,
  ) => {
    setActionPublicationId(publicationId);
    try {
      const completed = await operation();
      if (completed) {
        try {
          await refreshCurrentList();
        } catch (error) {
          toast.error(error instanceof Error ? error.message : t('publications.toast.refreshZoneFailed'));
        }
      }
    } finally {
      setActionPublicationId(null);
    }
  }, [refreshCurrentList, t]);

  const openCreate = () => {
    if (!visibleZones.length) {
      toast.error(t('publications.toast.noZones'));
      return;
    }

    setCreateTitle('');
    setCreateType(PUBLICATION_TYPE_OPTIONS[0].value);
    setCreateZoneId(activeZoneFilter !== ALL_ZONES_VALUE ? activeZoneFilter : '');
    setCreateOpen(true);
  };

  const createPublication = () => {
    const title = createTitle.trim();

    if (!title) {
      toast.error(t('publications.toast.titleRequired'));
      return;
    }

    if (!createZoneId) {
      toast.error(t('publications.toast.selectZoneFirst'));
      return;
    }

    const query = new URLSearchParams({
      zone_id: createZoneId,
      title,
      type: createType,
    });

    setCreateOpen(false);
    router.push(`/publications/new?${query.toString()}`);
  };

  const openEdit = (publication: Publication) => {
    const zoneId = publication.zone_id || selectedZoneId;
    const query = zoneId ? `?zone_id=${encodeURIComponent(zoneId)}` : '';
    router.push(`/publications/${publication.publication_id}${query}`);
  };

  const archivePublication = async (publicationId: string) => {
    await runPublicationAction(publicationId, async () => {
      try {
        await publicationService.archive(publicationId);
        toast.success(t('publications.toast.archived'));
        return true;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t('publications.toast.archiveFailed'));
        return false;
      }
    });
  };

  const restorePublication = async (publicationId: string) => {
    await runPublicationAction(publicationId, async () => {
      try {
        await publicationService.restore(publicationId);
        toast.success(t('publications.toast.restored'));
        return true;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t('publications.toast.restoreFailed'));
        return false;
      }
    });
  };

  const deletePublication = async (publication: Publication) => {
    await runPublicationAction(publication.publication_id, async () => {
      try {
        await publicationService.deletePermanent(publication.publication_id);
        setDeleteTarget(null);
        toast.success(t('publications.toast.deleted'));
        return true;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t('publications.toast.deleteFailed'));
        return false;
      }
    });
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

  const pageSize = 10;
  const total = publications.length;
  const pagedPublications = publications.slice((page - 1) * pageSize, page * pageSize);
  const colSpan = canWrite ? 7 : 6;
  const emptyMessage = listMode === 'archived'
    ? t('publications.emptyArchived')
    : activeZoneFilter === ALL_ZONES_VALUE
      ? t('publications.emptyAll')
      : t('publications.empty');
  const deletePending = deleteTarget ? actionPublicationId === deleteTarget.publication_id : false;

  return (
    <div className="space-y-4">
      <PageHeader
        description={t('publications.description')}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('publications.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('publications.deleteDescription', { title: deleteTarget?.title || '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePending}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && void deletePublication(deleteTarget)}
              disabled={deletePending}
            >
              {deletePending ? t('publications.deleting') : t('publications.deletePermanent')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isCreateOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('publications.createDialogTitle')}</DialogTitle>
            <DialogDescription>{t('publications.createDialogDescription')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="publication-create-title">{t('publications.title')}</Label>
              <Input
                id="publication-create-title"
                value={createTitle}
                onChange={(event) => setCreateTitle(event.target.value)}
                placeholder={t('publications.createPublication')}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    createPublication();
                  }
                }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="publication-create-zone">{t('publications.zone')}</Label>
              <Select value={createZoneId} onValueChange={setCreateZoneId}>
                <SelectTrigger id="publication-create-zone" className="w-full">
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
            </div>

            <div className="space-y-2">
              <Label htmlFor="publication-create-type">{t('publications.type')}</Label>
              <Select value={createType} onValueChange={setCreateType}>
                <SelectTrigger id="publication-create-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PUBLICATION_TYPE_OPTIONS.map((typeOption) => (
                    <SelectItem key={typeOption.value} value={typeOption.value}>
                      {typeOption.value === 'slideshow'
                        ? t('publications.type.slideshow')
                        : typeOption.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={createPublication}>
              {t('publications.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <Tabs
            value={listMode}
            onValueChange={(value) => setListMode(value as PublicationListMode)}
            className="gap-0"
          >
            <TabsList>
              <TabsTrigger value="current">{t('publications.currentTab')}</TabsTrigger>
              <TabsTrigger value="archived">{t('publications.archivedTab')}</TabsTrigger>
            </TabsList>
          </Tabs>

          <Select
            value={activeZoneFilter}
            onValueChange={(value) => {
              setSelectedZoneId(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-8 w-[280px]">
              <SelectValue placeholder={t('publications.selectZone')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_ZONES_VALUE}>{t('publications.allZones')}</SelectItem>
              {visibleZones.map((zone) => (
                <SelectItem key={zone.zone_id} value={zone.zone_id}>
                  {zone.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => void load()} disabled={loading}>
            <RotateCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="sr-only">{t('publications.refresh')}</span>
          </Button>
        </div>

        {canWrite ? (
          <Button size="sm" className="h-8 self-start sm:self-auto" onClick={openCreate}>
            <Plus className="mr-1.5 size-4" />
            {t('publications.create')}
          </Button>
        ) : null}
      </div>

      <DataTable
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">{t('publications.title')}</TableHead>
              <TableHead>{t('publications.type')}</TableHead>
              <TableHead>{t('publications.status')}</TableHead>
              <TableHead>{t('publications.version')}</TableHead>
              <TableHead>{t('publications.items')}</TableHead>
              <TableHead>{t('publications.usedInSlots')}</TableHead>
              {canWrite && <TableHead className="text-right">{t('publications.actions')}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="py-8 text-center text-muted-foreground">
                  {t('common.loading')}
                </TableCell>
              </TableRow>
            ) : null}

            {!loading ? pagedPublications.map((publication) => {
              const usageCount = usageByPublicationId[publication.publication_id] ?? 0;
              const isArchived = publication.status === 'archived';
              const isRowPending = actionPublicationId === publication.publication_id;
              const deleteDisabled = usageCount > 0;

              return (
                <TableRow key={publication.publication_id}>
                  <TableCell className="pl-4 font-medium">{publication.title}</TableCell>
                  <TableCell>{publication.type}</TableCell>
                  <TableCell>
                    <Badge variant={publication.status === 'active' ? 'default' : 'outline'}>
                      {publication.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{publication.version}</TableCell>
                  <TableCell>{publication.items.length}</TableCell>
                  <TableCell>{usageCount}</TableCell>
                  {canWrite ? (
                    <TableCell className="w-[1%] whitespace-nowrap text-right">
                      <div className="flex justify-end gap-2">
                        {!isArchived ? (
                          <Button variant="outline" size="sm" onClick={() => openEdit(publication)} disabled={isRowPending}>
                            {t('publications.edit')}
                          </Button>
                        ) : null}
                        {isArchived ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void restorePublication(publication.publication_id)}
                            disabled={isRowPending}
                          >
                            <RotateCcw className="size-4" />
                            {t('publications.restore')}
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void archivePublication(publication.publication_id)}
                            disabled={isRowPending}
                          >
                            <Archive className="size-4" />
                            {t('publications.archiveAction')}
                          </Button>
                        )}
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setDeleteTarget(publication)}
                          disabled={isRowPending || deleteDisabled}
                          title={deleteDisabled ? t('publications.deleteBlockedUsed') : t('publications.delete')}
                        >
                          <Trash2 className="size-4" />
                          {t('publications.delete')}
                        </Button>
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            }) : null}

            {!loading && total === 0 ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="py-8 text-center text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </DataTable>
    </div>
  );
}
