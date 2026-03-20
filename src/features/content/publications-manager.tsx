'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RotateCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/auth/store';
import { hasRole } from '@/auth/guards';
import { PageHeader } from '@/components/common/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
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
import { Textarea } from '@/components/ui/textarea';
import { useLocale } from '@/hooks/use-locale';
import { contentService } from '@/services/content-service';
import { publicationService } from '@/services/publication-service';
import { zoneService } from '@/services/zone-service';
import type { ContentAsset, Publication, PublicationItem, Zone } from '@/types/api';

type PublicationEditorState = {
  title: string;
  type: string;
  status: string;
  items: PublicationItem[];
};

const EMPTY_EDITOR: PublicationEditorState = {
  title: '',
  type: 'slideshow',
  status: 'draft',
  items: [],
};

function makeDefaultItem(type: 'custom_slide' | 'video_asset'): PublicationItem {
  if (type === 'video_asset') {
    return {
      item_id: crypto.randomUUID(),
      type: 'video_asset',
      title: 'Video item',
      duration_ms: 15000,
      transition: { type: 'cut', duration_ms: 0 },
      video: {
        asset_id: '',
        trim_in_ms: 0,
        trim_out_ms: 0,
        mute: true,
        loop: true,
      },
      metadata: {},
    };
  }

  return {
    item_id: crypto.randomUUID(),
    type: 'custom_slide',
    title: 'Slide',
    duration_ms: 10000,
    transition: { type: 'cut', duration_ms: 0 },
    slide: {
      background: '#0f172a',
      title: '',
      body: '',
      image_asset_id: '',
      logo_asset_id: '',
      layout: 'centered',
    },
    metadata: {},
  };
}

export function PublicationsManager() {
  const { t } = useLocale();
  const roles = useAuthStore((state) => state.roles);
  const allowedZones = useAuthStore((state) => state.zones);
  const hasPermission = useAuthStore((state) => state.hasPermission);

  const isAdmin = hasRole(roles, 'admin') || hasRole(roles, 'super_admin');
  const canRead = isAdmin || hasPermission('content.read');
  const canWrite = isAdmin || hasPermission('content.write');

  const [zones, setZones] = useState<Zone[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [assets, setAssets] = useState<ContentAsset[]>([]);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [loading, setLoading] = useState(true);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPublication, setEditingPublication] = useState<Publication | null>(null);
  const [editorState, setEditorState] = useState<PublicationEditorState>(EMPTY_EDITOR);
  const [saving, setSaving] = useState(false);

  const visibleZones = useMemo(() => {
    if (isAdmin) return zones;
    return zones.filter((zone) => allowedZones.includes(zone.zone_id));
  }, [allowedZones, isAdmin, zones]);

  const load = useCallback(async () => {
    if (!canRead) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const allZones = await zoneService.listZones();
      setZones(allZones);
      const effectiveZoneId = selectedZoneId || allZones[0]?.zone_id || '';
      if (!selectedZoneId && effectiveZoneId) {
        setSelectedZoneId(effectiveZoneId);
      }

      if (effectiveZoneId) {
        const [publicationRows, assetRows] = await Promise.all([
          publicationService.list(effectiveZoneId),
          contentService.list(effectiveZoneId),
        ]);
        setPublications(publicationRows);
        setAssets(assetRows.filter((asset) => asset.status === 'ready'));
      } else {
        setPublications([]);
        setAssets([]);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('publications.toast.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [canRead, selectedZoneId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedZoneId || !canRead) return;
    void (async () => {
      try {
        const [publicationRows, assetRows] = await Promise.all([
          publicationService.list(selectedZoneId),
          contentService.list(selectedZoneId),
        ]);
        setPublications(publicationRows);
        setAssets(assetRows.filter((asset) => asset.status === 'ready'));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t('publications.toast.refreshZoneFailed'));
      }
    })();
  }, [canRead, selectedZoneId, t]);

  const resetEditor = () => {
    setEditingPublication(null);
    setEditorState(EMPTY_EDITOR);
  };

  const openCreate = () => {
    setEditingPublication(null);
    setEditorState({
      ...EMPTY_EDITOR,
      title: t('publications.createPublication'),
      items: [makeDefaultItem('custom_slide')],
    });
    setEditorOpen(true);
  };

  const openEdit = (publication: Publication) => {
    setEditingPublication(publication);
    setEditorState({
      title: publication.title,
      type: publication.type || 'slideshow',
      status: publication.status || 'draft',
      items: (publication.items || []) as PublicationItem[],
    });
    setEditorOpen(true);
  };

  const upsertItem = (index: number, next: PublicationItem) => {
    setEditorState((prev) => {
      const items = [...prev.items];
      items[index] = next;
      return { ...prev, items };
    });
  };

  const addItem = (type: 'custom_slide' | 'video_asset') => {
    setEditorState((prev) => ({ ...prev, items: [...prev.items, makeDefaultItem(type)] }));
  };

  const removeItem = (index: number) => {
    setEditorState((prev) => ({ ...prev, items: prev.items.filter((_, idx) => idx !== index) }));
  };

  const savePublication = async () => {
    if (!selectedZoneId) {
      toast.error(t('publications.toast.selectZoneFirst'));
      return;
    }
    if (!editorState.title.trim()) {
      toast.error(t('publications.toast.titleRequired'));
      return;
    }

    setSaving(true);
    try {
      if (editingPublication) {
        await publicationService.update(editingPublication.publication_id, {
          title: editorState.title.trim(),
          type: editorState.type,
          status: editorState.status,
          items: editorState.items,
        });
      } else {
        await publicationService.create({
          zone_id: selectedZoneId,
          title: editorState.title.trim(),
          type: editorState.type,
          status: editorState.status,
          items: editorState.items,
        });
      }
      toast.success(t('publications.toast.saved'));
      setEditorOpen(false);
      resetEditor();
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('publications.toast.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const archivePublication = async (publicationId: string) => {
    try {
      await publicationService.archive(publicationId);
      toast.success(t('publications.toast.archived'));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('publications.toast.archiveFailed'));
    }
  };

  if (!canRead) {
    return (
      <div className="space-y-4">
        <PageHeader description={t('publications.editorMvp')} />
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
                <TableCell colSpan={canWrite ? 6 : 5} className="py-8 text-center text-muted-foreground">
                  {t('publications.empty')}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <Dialog open={editorOpen} onOpenChange={(open) => { setEditorOpen(open); if (!open) resetEditor(); }}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-auto">
          <DialogHeader>
            <DialogTitle>
              {editingPublication ? t('publications.editPublication') : t('publications.createPublication')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="space-y-1.5 md:col-span-2">
                <Label>{t('publications.title')}</Label>
                <Input
                  value={editorState.title}
                  onChange={(event) => setEditorState((prev) => ({ ...prev, title: event.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t('publications.status')}</Label>
                <Select
                  value={editorState.status}
                  onValueChange={(value) => setEditorState((prev) => ({ ...prev, status: value }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">draft</SelectItem>
                    <SelectItem value="active">active</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => addItem('custom_slide')}>
                {t('publications.addSlide')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => addItem('video_asset')}>
                {t('publications.addVideoItem')}
              </Button>
            </div>

            <div className="space-y-4">
              {editorState.items.map((item, index) => (
                <div key={item.item_id || `${item.type}-${index}`} className="space-y-3 rounded-md border p-3">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                    <div className="space-y-1.5">
                      <Label>{t('publications.itemType')}</Label>
                      <Select
                        value={item.type}
                        onValueChange={(value: 'custom_slide' | 'video_asset') => {
                          upsertItem(index, {
                            ...makeDefaultItem(value),
                            item_id: item.item_id || crypto.randomUUID(),
                            title: item.title,
                          });
                        }}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="custom_slide">custom_slide</SelectItem>
                          <SelectItem value="video_asset">video_asset</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5 md:col-span-2">
                      <Label>{t('publications.itemTitle')}</Label>
                      <Input
                        value={item.title || ''}
                        onChange={(event) => upsertItem(index, { ...item, title: event.target.value })}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label>{t('publications.duration')}</Label>
                      <Input
                        type="number"
                        value={item.duration_ms || 10000}
                        onChange={(event) => upsertItem(index, {
                          ...item,
                          duration_ms: Math.max(1000, Number(event.target.value) || 1000),
                        })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label>{t('publications.transition')}</Label>
                      <Select
                        value={item.transition?.type || 'cut'}
                        onValueChange={(value: 'cut' | 'fade') => upsertItem(index, {
                          ...item,
                          transition: { ...(item.transition || {}), type: value },
                        })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cut">cut</SelectItem>
                          <SelectItem value="fade">fade</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t('publications.transitionDuration')}</Label>
                      <Input
                        type="number"
                        value={item.transition?.duration_ms || 0}
                        onChange={(event) => upsertItem(index, {
                          ...item,
                          transition: {
                            ...(item.transition || {}),
                            duration_ms: Math.max(0, Number(event.target.value) || 0),
                          },
                        })}
                      />
                    </div>
                  </div>

                  {item.type === 'custom_slide' ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <div className="space-y-1.5">
                          <Label>{t('publications.background')}</Label>
                          <Input
                            value={item.slide?.background || ''}
                            onChange={(event) => upsertItem(index, {
                              ...item,
                              slide: { ...(item.slide || {}), background: event.target.value },
                            })}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>{t('publications.layout')}</Label>
                          <Select
                            value={item.slide?.layout || 'centered'}
                            onValueChange={(value: 'centered' | 'split' | 'title-top') => upsertItem(index, {
                              ...item,
                              slide: { ...(item.slide || {}), layout: value },
                            })}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="centered">centered</SelectItem>
                              <SelectItem value="split">split</SelectItem>
                              <SelectItem value="title-top">title-top</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label>{t('publications.imageAsset')}</Label>
                        <Select
                            value={item.slide?.image_asset_id || '__none__'}
                            onValueChange={(value) => upsertItem(index, {
                              ...item,
                              slide: { ...(item.slide || {}), image_asset_id: value === '__none__' ? '' : value },
                            })}
                          >
                            <SelectTrigger><SelectValue placeholder={t('publications.optionalImage')} /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">{t('publications.none')}</SelectItem>
                              {assets.map((asset) => (
                                <SelectItem key={asset.asset_id} value={asset.asset_id}>
                                  {asset.filename}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label>{t('publications.slideTitle')}</Label>
                        <Input
                          value={item.slide?.title || ''}
                          onChange={(event) => upsertItem(index, {
                            ...item,
                            slide: { ...(item.slide || {}), title: event.target.value },
                          })}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label>{t('publications.slideBody')}</Label>
                        <Textarea
                          rows={4}
                          value={item.slide?.body || ''}
                          onChange={(event) => upsertItem(index, {
                            ...item,
                            slide: { ...(item.slide || {}), body: event.target.value },
                          })}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div className="space-y-1.5">
                        <Label>{t('publications.videoAsset')}</Label>
                        <Select
                          value={item.video?.asset_id || '__none__'}
                          onValueChange={(value) => upsertItem(index, {
                            ...item,
                            video: { ...(item.video || {}), asset_id: value === '__none__' ? '' : value },
                          })}
                        >
                          <SelectTrigger><SelectValue placeholder={t('publications.selectAsset')} /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">{t('publications.selectAsset')}</SelectItem>
                            {assets
                              .filter((asset) => asset.content_type.startsWith('video/'))
                              .map((asset) => (
                                <SelectItem key={asset.asset_id} value={asset.asset_id}>
                                  {asset.filename}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>{t('publications.trimIn')}</Label>
                        <Input
                          type="number"
                          value={item.video?.trim_in_ms || 0}
                          onChange={(event) => upsertItem(index, {
                            ...item,
                            video: {
                              ...(item.video || {}),
                              trim_in_ms: Math.max(0, Number(event.target.value) || 0),
                            },
                          })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>{t('publications.trimOut')}</Label>
                        <Input
                          type="number"
                          value={item.video?.trim_out_ms || 0}
                          onChange={(event) => upsertItem(index, {
                            ...item,
                            video: {
                              ...(item.video || {}),
                              trim_out_ms: Math.max(0, Number(event.target.value) || 0),
                            },
                          })}
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <Input
                          className="h-4 w-4"
                          type="checkbox"
                          checked={item.video?.mute ?? true}
                          onChange={(event) => upsertItem(index, {
                            ...item,
                            video: { ...(item.video || {}), mute: event.target.checked },
                          })}
                        />
                        <Label>{t('publications.mute')}</Label>
                      </div>

                      <div className="flex items-center gap-2">
                        <Input
                          className="h-4 w-4"
                          type="checkbox"
                          checked={item.video?.loop ?? true}
                          onChange={(event) => upsertItem(index, {
                            ...item,
                            video: { ...(item.video || {}), loop: event.target.checked },
                          })}
                        />
                        <Label>{t('publications.loop')}</Label>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end">
                    <Button variant="ghost" size="sm" onClick={() => removeItem(index)}>
                      {t('publications.removeItem')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditorOpen(false); resetEditor(); }}>
              {t('settings.cancel')}
            </Button>
            <Button onClick={savePublication} disabled={saving}>
              {saving ? t('publications.saving') : t('publications.savePublication')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
