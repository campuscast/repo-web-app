'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Clapperboard,
  FileImage,
  GripVertical,
  ImageOff,
  Plus,
  Save,
  Trash2,
  Upload,
  Video,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { hasRole } from '@/auth/guards';
import { useAuthStore } from '@/auth/store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useLocale } from '@/hooks/use-locale';
import { cn } from '@/lib/utils';
import { contentService } from '@/services/content-service';
import { publicationService } from '@/services/publication-service';
import { zoneService } from '@/services/zone-service';
import type { ContentAsset, PublicationItem, Zone } from '@/types/api';
import {
  hasSlideTextContent,
  removeItemAndResolveSelection,
  resolveSelectedItemId,
  toApiSlideData,
  toEditorSlideData,
  type EditorSlideData,
  type SlideImageFitMode,
  type SlideLayout,
} from './publication-editor-state';
import {
  getSlideImageClassName,
  getSlideImageStyle,
  getSlideScrimClassName,
  getSlideTextBlockClassName,
  getSlideTextLayerClassName,
  normalizeSlideImageFitMode,
  resolveSlidePresentation,
} from './custom-slide-rendering';

type PublicationStatus = 'draft' | 'active' | 'archived';
type TransitionType = 'cut' | 'fade';

type EditorTransition = {
  type: TransitionType;
  durationMs: number;
};

type EditorVideoData = {
  assetId: string;
  trimInMs: number;
  trimOutMs: number;
  mute: boolean;
  loop: boolean;
};

type EditorItemBase = {
  itemId: string;
  title: string;
  durationMs: number;
  transition: EditorTransition;
  metadata: Record<string, unknown>;
};

type EditorSlideItem = EditorItemBase & {
  type: 'custom_slide';
  slide: EditorSlideData;
};

type EditorVideoItem = EditorItemBase & {
  type: 'video_asset';
  video: EditorVideoData;
};

type EditorPublicationItem = EditorSlideItem | EditorVideoItem;

type EditorState = {
  zoneId: string;
  title: string;
  type: string;
  status: PublicationStatus;
  items: EditorPublicationItem[];
};

type PublicationEditorPageProps = {
  mode: 'create' | 'edit';
  publicationId?: string;
};

const MINIO_PUBLIC_URL = process.env.NEXT_PUBLIC_MINIO_PUBLIC_URL ?? 'http://localhost:9000';
const MINIO_BUCKET = 'campuscast-content';

function makeItemId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function asPositiveNumber(value: unknown, fallback: number, min = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.round(parsed));
}

function normalizeStatus(status?: string): PublicationStatus {
  if (status === 'active' || status === 'archived' || status === 'draft') {
    return status;
  }
  return 'draft';
}

function makeDefaultSlideItem(): EditorSlideItem {
  return {
    itemId: makeItemId(),
    type: 'custom_slide',
    title: 'Slide',
    durationMs: 10000,
    transition: { type: 'cut', durationMs: 0 },
    slide: toEditorSlideData(),
    metadata: {},
  };
}

function makeDefaultVideoItem(): EditorVideoItem {
  return {
    itemId: makeItemId(),
    type: 'video_asset',
    title: 'Video item',
    durationMs: 15000,
    transition: { type: 'cut', durationMs: 0 },
    video: {
      assetId: '',
      trimInMs: 0,
      trimOutMs: 0,
      mute: true,
      loop: true,
    },
    metadata: {},
  };
}

function makeDefaultItem(type: 'custom_slide' | 'video_asset'): EditorPublicationItem {
  return type === 'video_asset' ? makeDefaultVideoItem() : makeDefaultSlideItem();
}

function toEditorItem(item: PublicationItem): EditorPublicationItem {
  const common: EditorItemBase = {
    itemId: item.item_id || makeItemId(),
    title: item.title || '',
    durationMs: asPositiveNumber(item.duration_ms, 10000, 1000),
    transition: {
      type: (item.transition?.type === 'fade' ? 'fade' : 'cut') as TransitionType,
      durationMs: asPositiveNumber(item.transition?.duration_ms, 0, 0),
    },
    metadata: item.metadata ?? {},
  };

  if (item.type === 'video_asset') {
    return {
      ...common,
      type: 'video_asset',
      video: {
        assetId: item.video?.asset_id || '',
        trimInMs: asPositiveNumber(item.video?.trim_in_ms, 0, 0),
        trimOutMs: asPositiveNumber(item.video?.trim_out_ms, 0, 0),
        mute: item.video?.mute ?? true,
        loop: item.video?.loop ?? true,
      },
    };
  }

  return {
    ...common,
    type: 'custom_slide',
    slide: toEditorSlideData(item.slide),
  };
}

function toApiItem(item: EditorPublicationItem): PublicationItem {
  const base = {
    item_id: item.itemId,
    type: item.type,
    title: item.title,
    duration_ms: asPositiveNumber(item.durationMs, 10000, 1000),
    transition: {
      type: item.transition.type,
      duration_ms: asPositiveNumber(item.transition.durationMs, 0, 0),
    },
    metadata: item.metadata,
  } as PublicationItem;

  if (item.type === 'video_asset') {
    return {
      ...base,
      video: {
        asset_id: item.video.assetId,
        trim_in_ms: asPositiveNumber(item.video.trimInMs, 0, 0),
        trim_out_ms: asPositiveNumber(item.video.trimOutMs, 0, 0),
        mute: item.video.mute,
        loop: item.video.loop,
      },
    };
  }

  return {
    ...base,
    slide: toApiSlideData(item.slide),
  };
}

function moveItem<T>(items: T[], from: number, to: number) {
  if (from === to) return items;
  const next = [...items];
  const [entry] = next.splice(from, 1);
  next.splice(to, 0, entry);
  return next;
}

function assetPreviewUrl(asset?: ContentAsset) {
  if (!asset?.storage_key) return null;
  return `${MINIO_PUBLIC_URL}/${MINIO_BUCKET}/${asset.storage_key}`;
}

function formatDurationLabel(durationMs: number) {
  const seconds = Math.max(1, Math.round(durationMs / 1000));
  return `${seconds}s`;
}

type AssetSelectorProps = {
  assets: ContentAsset[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  noneLabel: string;
};

function AssetSelector({
  assets,
  value,
  onChange,
  placeholder,
  noneLabel,
}: AssetSelectorProps) {
  return (
    <Select
      value={value || '__none__'}
      onValueChange={(next) => onChange(next === '__none__' ? '' : next)}
    >
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">{noneLabel}</SelectItem>
        {assets.map((asset) => (
          <SelectItem key={asset.asset_id} value={asset.asset_id}>
            {asset.filename}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function PublicationItemPreview({
  item,
  assets,
  imageOnlyLabel,
}: {
  item: EditorPublicationItem | null;
  assets: ContentAsset[];
  imageOnlyLabel: string;
}) {
  if (!item) {
    return (
      <div className="flex min-h-[340px] items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
        Select a slide on the left to preview it.
      </div>
    );
  }

  if (item.type === 'video_asset') {
    const videoAsset = assets.find((asset) => asset.asset_id === item.video.assetId);
    const videoUrl = assetPreviewUrl(videoAsset);

    return (
      <div className="space-y-3">
        <div className="aspect-video overflow-hidden rounded-xl border bg-black">
          {videoAsset && videoUrl ? (
            <video src={videoUrl} className="h-full w-full" controls muted={item.video.mute} loop={item.video.loop} />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-sm text-white/70">
              <Video className="size-8" />
              <p>No video asset selected</p>
            </div>
          )}
        </div>
        <div className="rounded-xl border bg-card p-3">
          <p className="text-sm font-medium">{item.title || 'Untitled video item'}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDurationLabel(item.durationMs)} • transition {item.transition.type}
          </p>
        </div>
      </div>
    );
  }

  const imageAsset = assets.find((asset) => asset.asset_id === item.slide.imageAssetId);
  const imageUrl = assetPreviewUrl(imageAsset);
  const model = resolveSlidePresentation({
    background: item.slide.background,
    title: item.slide.title,
    body: item.slide.body,
    layout: item.slide.layout,
    image_fit: item.slide.imageFit,
    text_overlay: item.slide.showTextOverlay,
  });
  const showTextOverlay = model.renderTextOverlay;

  return (
    <div className="space-y-3">
      <div
        className="relative aspect-video overflow-hidden rounded-xl border"
        style={{ background: model.background }}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={model.title || item.title}
            className={getSlideImageClassName(model.imageFit)}
            style={getSlideImageStyle(model.imageFit)}
          />
        ) : null}

        {showTextOverlay ? (
          <>
            <div className={getSlideScrimClassName(model.layout)} />
            <div className={getSlideTextLayerClassName(model.layout)}>
              <div className={cn(getSlideTextBlockClassName(model.layout), 'text-white')}>
                {model.title ? <h3 className="text-lg font-semibold tracking-tight">{model.title}</h3> : null}
                {model.body ? <p className="text-sm leading-relaxed text-white/90">{model.body}</p> : null}
              </div>
            </div>
          </>
        ) : null}
      </div>

      <div className="rounded-xl border bg-card p-3">
        <p className="text-sm font-medium">{item.title || 'Untitled slide'}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {formatDurationLabel(item.durationMs)} • transition {item.transition.type}
        </p>
        {!showTextOverlay && !hasSlideTextContent(item.slide) ? (
          <p className="mt-1 text-xs text-muted-foreground">{imageOnlyLabel}</p>
        ) : null}
      </div>
    </div>
  );
}

export function PublicationEditorPage({ mode, publicationId }: PublicationEditorPageProps) {
  const { t } = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const zoneIdFromQuery = searchParams.get('zone_id') || '';

  const roles = useAuthStore((state) => state.roles);
  const allowedZones = useAuthStore((state) => state.zones);
  const hasPermission = useAuthStore((state) => state.hasPermission);

  const isAdmin = hasRole(roles, 'admin') || hasRole(roles, 'super_admin');
  const canRead = isAdmin || hasPermission('content.read');
  const canWrite = isAdmin || hasPermission('content.write');

  const [zones, setZones] = useState<Zone[]>([]);
  const [assets, setAssets] = useState<ContentAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draggingItemId, setDraggingItemId] = useState('');

  const [editorState, setEditorState] = useState<EditorState>({
    zoneId: '',
    title: mode === 'create' ? t('publications.createPublication') : '',
    type: 'slideshow',
    status: 'draft',
    items: [makeDefaultSlideItem()],
  });
  const [selectedItemId, setSelectedItemId] = useState('');

  const visibleZones = useMemo(() => {
    if (isAdmin) return zones;
    return zones.filter((zone) => allowedZones.includes(zone.zone_id));
  }, [allowedZones, isAdmin, zones]);

  const selectedItem = useMemo(
    () => editorState.items.find((item) => item.itemId === selectedItemId) ?? null,
    [editorState.items, selectedItemId],
  );
  const selectedZone = useMemo(
    () => zones.find((zone) => zone.zone_id === editorState.zoneId) ?? null,
    [editorState.zoneId, zones],
  );

  const imageAssets = useMemo(
    () => assets.filter((asset) => asset.content_type.startsWith('image/')),
    [assets],
  );

  const videoAssets = useMemo(
    () => assets.filter((asset) => asset.content_type.startsWith('video/')),
    [assets],
  );

  useEffect(() => {
    setSelectedItemId((prevSelectedItemId) => {
      const nextSelectedItemId = resolveSelectedItemId(editorState.items, prevSelectedItemId);
      return prevSelectedItemId === nextSelectedItemId ? prevSelectedItemId : nextSelectedItemId;
    });
  }, [editorState.items]);

  const loadAssets = useCallback(async (zoneId: string) => {
    if (!zoneId) {
      setAssets([]);
      return;
    }

    const zoneAssets = await contentService.list(zoneId);
    setAssets(zoneAssets.filter((asset) => asset.status === 'ready'));
  }, []);

  const loadEditor = useCallback(async () => {
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

      if (mode === 'edit') {
        if (!publicationId) {
          throw new Error('Publication ID is required');
        }

        const publication = await publicationService.get(publicationId);
        const nextItems = (publication.items || []).map(toEditorItem);

        setEditorState({
          zoneId: publication.zone_id,
          title: publication.title,
          type: publication.type || 'slideshow',
          status: normalizeStatus(publication.status),
          items: nextItems.length > 0 ? nextItems : [makeDefaultSlideItem()],
        });

        await loadAssets(publication.zone_id);
        return;
      }

      const effectiveZoneId =
        availableZones.find((zone) => zone.zone_id === zoneIdFromQuery)?.zone_id ||
        availableZones[0]?.zone_id ||
        '';

      setEditorState((prev) => ({
        ...prev,
        zoneId: effectiveZoneId,
        items: prev.items.length > 0 ? prev.items : [makeDefaultSlideItem()],
      }));

      await loadAssets(effectiveZoneId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('publications.toast.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [allowedZones, canRead, isAdmin, loadAssets, mode, publicationId, t, zoneIdFromQuery]);

  useEffect(() => {
    void loadEditor();
  }, [loadEditor]);

  const updateSelectedItem = (updater: (item: EditorPublicationItem) => EditorPublicationItem) => {
    if (!selectedItemId) return;

    setEditorState((prev) => ({
      ...prev,
      items: prev.items.map((item) => (item.itemId === selectedItemId ? updater(item) : item)),
    }));
  };

  const addItem = (type: 'custom_slide' | 'video_asset') => {
    const nextItem = makeDefaultItem(type);

    setEditorState((prev) => ({
      ...prev,
      items: [...prev.items, nextItem],
    }));
    setSelectedItemId(nextItem.itemId);
  };

  const removeItemById = (itemId: string) => {
    const next = removeItemAndResolveSelection(editorState.items, selectedItemId, itemId);

    setEditorState((prev) => ({
      ...prev,
      items: next.items,
    }));
    setSelectedItemId(next.selectedItemId);
  };

  const reorderBy = (offset: -1 | 1) => {
    if (!selectedItemId) return;

    setEditorState((prev) => {
      const from = prev.items.findIndex((item) => item.itemId === selectedItemId);
      if (from < 0) return prev;

      const to = from + offset;
      if (to < 0 || to >= prev.items.length) return prev;

      return {
        ...prev,
        items: moveItem(prev.items, from, to),
      };
    });
  };

  const handleZoneChange = (zoneId: string) => {
    setEditorState((prev) => ({
      ...prev,
      zoneId,
      items: prev.items.map((item) => {
        if (item.type === 'video_asset') {
          return {
            ...item,
            video: { ...item.video, assetId: '' },
          };
        }

        return {
          ...item,
          slide: { ...item.slide, imageAssetId: '' },
        };
      }),
    }));

    void loadAssets(zoneId);
  };

  const onDropOnItem = (targetItemId: string) => {
    if (!draggingItemId || draggingItemId === targetItemId) return;

    setEditorState((prev) => {
      const from = prev.items.findIndex((item) => item.itemId === draggingItemId);
      const to = prev.items.findIndex((item) => item.itemId === targetItemId);
      if (from < 0 || to < 0) return prev;

      return {
        ...prev,
        items: moveItem(prev.items, from, to),
      };
    });

    setDraggingItemId('');
  };

  const savePublication = async (nextStatus?: PublicationStatus) => {
    if (!canWrite) return;

    if (!editorState.zoneId) {
      toast.error(t('publications.toast.selectZoneFirst'));
      return;
    }

    if (!editorState.title.trim()) {
      toast.error(t('publications.toast.titleRequired'));
      return;
    }

    if (editorState.items.length === 0) {
      toast.error(t('publications.toast.atLeastOneItem'));
      return;
    }

    setSaving(true);

    try {
      const status = nextStatus ?? editorState.status;
      const payload = {
        title: editorState.title.trim(),
        type: editorState.type,
        status,
        items: editorState.items.map(toApiItem),
      };

      if (mode === 'edit' && publicationId) {
        await publicationService.update(publicationId, payload);
        setEditorState((prev) => ({ ...prev, status }));
        toast.success(t('publications.toast.saved'));
        return;
      }

      const created = await publicationService.create({
        zone_id: editorState.zoneId,
        ...payload,
      });

      toast.success(t('publications.toast.saved'));
      router.replace(`/publications/${created.publication_id}?zone_id=${encodeURIComponent(created.zone_id)}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('publications.toast.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (!canRead) {
    return (
      <p className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        {t('publications.noPermission')}
      </p>
    );
  }

  if (loading) {
    return (
      <div className="rounded-xl border p-6 text-sm text-muted-foreground">
        {t('common.loading')}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-[300px] flex-1 items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => router.push('/publications')}>
              <ArrowLeft className="size-4" />
            </Button>

            <Input
              className="h-11 text-lg font-semibold"
              value={editorState.title}
              onChange={(event) => setEditorState((prev) => ({ ...prev, title: event.target.value }))}
              placeholder={t('publications.title')}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {mode === 'create' ? (
              <Select value={editorState.zoneId} onValueChange={handleZoneChange}>
                <SelectTrigger className="w-[220px]">
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
            ) : (
              <div className="flex items-center gap-2">
                <Badge variant="outline">{selectedZone?.name || editorState.zoneId}</Badge>
                <Badge variant="outline">{t('publications.zoneLocked')}</Badge>
              </div>
            )}

            <Select
              value={editorState.status}
              onValueChange={(value: PublicationStatus) => setEditorState((prev) => ({ ...prev, status: value }))}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">draft</SelectItem>
                <SelectItem value="active">active</SelectItem>
                <SelectItem value="archived">archived</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" onClick={() => router.push('/publications')}>
              {t('settings.cancel')}
            </Button>
            <Button variant="outline" onClick={() => void savePublication()} disabled={!canWrite || saving}>
              <Save className="mr-1.5 size-4" />
              {saving ? t('publications.saving') : t('publications.savePublication')}
            </Button>
            <Button onClick={() => void savePublication('active')} disabled={!canWrite || saving}>
              <Upload className="mr-1.5 size-4" />
              {t('publications.publish')}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
        <section className="rounded-xl border bg-card">
          <div className="border-b p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">{t('publications.items')}</h2>
              <Badge variant="outline">{editorState.items.length}</Badge>
            </div>
            <div className="mt-3 flex gap-2">
              <Button variant="outline" size="sm" onClick={() => addItem('custom_slide')}>
                <Plus className="mr-1 size-4" />
                {t('publications.addSlide')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => addItem('video_asset')}>
                <Plus className="mr-1 size-4" />
                {t('publications.addVideoItem')}
              </Button>
            </div>
          </div>

          <ScrollArea className="h-[calc(100vh-290px)]">
            <div className="space-y-2 p-3">
              {editorState.items.map((item) => {
                const selected = selectedItemId === item.itemId;

                return (
                  <div
                    key={item.itemId}
                    draggable
                    onDragStart={() => setDraggingItemId(item.itemId)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => onDropOnItem(item.itemId)}
                    onClick={() => setSelectedItemId(item.itemId)}
                    className={cn(
                      'w-full cursor-pointer rounded-lg border p-3 text-left transition',
                      selected ? 'border-primary bg-primary/5' : 'hover:border-muted-foreground/40 hover:bg-muted/40',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <GripVertical className="size-4 text-muted-foreground" />
                        {item.type === 'custom_slide' ? <FileImage className="size-4" /> : <Clapperboard className="size-4" />}
                        <span className="text-xs text-muted-foreground">{item.type}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">{formatDurationLabel(item.durationMs)}</span>
                        <button
                          type="button"
                          title={t('publications.removeItem')}
                          aria-label={t('publications.removeItem')}
                          onClick={(event) => {
                            event.stopPropagation();
                            removeItemById(item.itemId);
                          }}
                          className="rounded-md p-1 text-muted-foreground/45 transition-colors hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </div>
                    <p className="mt-2 truncate text-sm font-medium">{item.title || t('publications.untitledItem')}</p>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </section>

        <section className="rounded-xl border bg-card">
          <div className="border-b p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">{t('publications.selectedItem')}</h2>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={() => reorderBy(-1)} disabled={!selectedItem}>
                  <ArrowUp className="size-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => reorderBy(1)} disabled={!selectedItem}>
                  <ArrowDown className="size-4" />
                </Button>
              </div>
            </div>
          </div>

          <ScrollArea className="h-[calc(100vh-290px)]">
            {!selectedItem ? (
              <div className="p-6 text-sm text-muted-foreground">
                {t('publications.selectItemHint')}
              </div>
            ) : (
              <div className="space-y-4 p-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label>{t('publications.itemType')}</Label>
                    <Select
                      value={selectedItem.type}
                      onValueChange={(value: 'custom_slide' | 'video_asset') =>
                        updateSelectedItem((item) => {
                          const switched = makeDefaultItem(value);
                          return {
                            ...switched,
                            itemId: item.itemId,
                            title: item.title || switched.title,
                            durationMs: item.durationMs,
                            transition: item.transition,
                            metadata: item.metadata,
                          };
                        })
                      }
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
                      value={selectedItem.title}
                      onChange={(event) => updateSelectedItem((item) => ({ ...item, title: event.target.value }))}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>{t('publications.duration')}</Label>
                    <Input
                      type="number"
                      value={selectedItem.durationMs}
                      onChange={(event) =>
                        updateSelectedItem((item) => ({
                          ...item,
                          durationMs: asPositiveNumber(event.target.value, item.durationMs, 1000),
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>{t('publications.transition')}</Label>
                    <Select
                      value={selectedItem.transition.type}
                      onValueChange={(value: TransitionType) =>
                        updateSelectedItem((item) => ({
                          ...item,
                          transition: { ...item.transition, type: value },
                        }))
                      }
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
                      value={selectedItem.transition.durationMs}
                      onChange={(event) =>
                        updateSelectedItem((item) => ({
                          ...item,
                          transition: {
                            ...item.transition,
                            durationMs: asPositiveNumber(event.target.value, item.transition.durationMs, 0),
                          },
                        }))
                      }
                    />
                  </div>
                </div>

                {selectedItem.type === 'custom_slide' ? (
                  <>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>{t('publications.imageFit')}</Label>
                        <Select
                          value={normalizeSlideImageFitMode(selectedItem.slide.imageFit)}
                          onValueChange={(value: SlideImageFitMode) =>
                            updateSelectedItem((item) =>
                              item.type === 'custom_slide'
                                ? { ...item, slide: { ...item.slide, imageFit: value } }
                                : item,
                            )
                          }
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cover">{t('publications.imageFit.cover')}</SelectItem>
                            <SelectItem value="contain">{t('publications.imageFit.contain')}</SelectItem>
                            <SelectItem value="stretch">{t('publications.imageFit.stretch')}</SelectItem>
                            <SelectItem value="center">{t('publications.imageFit.center')}</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">{t('publications.imageFitHint')}</p>
                      </div>

                      <div className="space-y-1.5">
                        <Label>{t('publications.layout')}</Label>
                        <Select
                          value={selectedItem.slide.layout}
                          onValueChange={(value: SlideLayout) =>
                            updateSelectedItem((item) =>
                              item.type === 'custom_slide'
                                ? { ...item, slide: { ...item.slide, layout: value } }
                                : item,
                            )
                          }
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="centered">{t('publications.layout.centered')}</SelectItem>
                            <SelectItem value="split">{t('publications.layout.split')}</SelectItem>
                            <SelectItem value="title-top">{t('publications.layout.titleTop')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>{t('publications.background')}</Label>
                        <Input
                          value={selectedItem.slide.background}
                          onChange={(event) =>
                            updateSelectedItem((item) =>
                              item.type === 'custom_slide'
                                ? { ...item, slide: { ...item.slide, background: event.target.value } }
                                : item,
                            )
                          }
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label>{t('publications.imageAsset')}</Label>
                      <AssetSelector
                        assets={imageAssets}
                        value={selectedItem.slide.imageAssetId}
                        onChange={(nextValue) =>
                          updateSelectedItem((item) =>
                            item.type === 'custom_slide'
                              ? { ...item, slide: { ...item.slide, imageAssetId: nextValue } }
                              : item,
                          )
                        }
                        placeholder={t('publications.optionalImage')}
                        noneLabel={t('publications.none')}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label>{t('publications.textOverlay')}</Label>
                      <label className="flex items-center gap-2 rounded-md border p-2 text-sm">
                        <Input
                          className="h-4 w-4"
                          type="checkbox"
                          checked={selectedItem.slide.showTextOverlay}
                          onChange={(event) =>
                            updateSelectedItem((item) =>
                              item.type === 'custom_slide'
                                ? { ...item, slide: { ...item.slide, showTextOverlay: event.target.checked } }
                                : item,
                            )
                          }
                        />
                        {t('publications.textOverlay')}
                      </label>
                      <p className="text-xs text-muted-foreground">{t('publications.textOverlayHint')}</p>
                    </div>

                    <div className="space-y-1.5">
                      <Label>{t('publications.slideTitle')}</Label>
                      <Input
                        value={selectedItem.slide.title}
                        onChange={(event) =>
                          updateSelectedItem((item) =>
                            item.type === 'custom_slide'
                              ? { ...item, slide: { ...item.slide, title: event.target.value } }
                              : item,
                          )
                        }
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label>{t('publications.slideBody')}</Label>
                      <Textarea
                        rows={8}
                        value={selectedItem.slide.body}
                        onChange={(event) =>
                          updateSelectedItem((item) =>
                            item.type === 'custom_slide'
                              ? { ...item, slide: { ...item.slide, body: event.target.value } }
                              : item,
                          )
                        }
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <Label>{t('publications.videoAsset')}</Label>
                      <AssetSelector
                        assets={videoAssets}
                        value={selectedItem.video.assetId}
                        onChange={(nextValue) =>
                          updateSelectedItem((item) =>
                            item.type === 'video_asset'
                              ? { ...item, video: { ...item.video, assetId: nextValue } }
                              : item,
                          )
                        }
                        placeholder={t('publications.selectAsset')}
                        noneLabel={t('publications.none')}
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>{t('publications.trimIn')}</Label>
                        <Input
                          type="number"
                          value={selectedItem.video.trimInMs}
                          onChange={(event) =>
                            updateSelectedItem((item) =>
                              item.type === 'video_asset'
                                ? {
                                  ...item,
                                  video: {
                                    ...item.video,
                                    trimInMs: asPositiveNumber(event.target.value, item.video.trimInMs, 0),
                                  },
                                }
                                : item,
                            )
                          }
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label>{t('publications.trimOut')}</Label>
                        <Input
                          type="number"
                          value={selectedItem.video.trimOutMs}
                          onChange={(event) =>
                            updateSelectedItem((item) =>
                              item.type === 'video_asset'
                                ? {
                                  ...item,
                                  video: {
                                    ...item.video,
                                    trimOutMs: asPositiveNumber(event.target.value, item.video.trimOutMs, 0),
                                  },
                                }
                                : item,
                            )
                          }
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <label className="flex items-center gap-2 rounded-md border p-2 text-sm">
                        <Input
                          className="h-4 w-4"
                          type="checkbox"
                          checked={selectedItem.video.mute}
                          onChange={(event) =>
                            updateSelectedItem((item) =>
                              item.type === 'video_asset'
                                ? { ...item, video: { ...item.video, mute: event.target.checked } }
                                : item,
                            )
                          }
                        />
                        {t('publications.mute')}
                      </label>

                      <label className="flex items-center gap-2 rounded-md border p-2 text-sm">
                        <Input
                          className="h-4 w-4"
                          type="checkbox"
                          checked={selectedItem.video.loop}
                          onChange={(event) =>
                            updateSelectedItem((item) =>
                              item.type === 'video_asset'
                                ? { ...item, video: { ...item.video, loop: event.target.checked } }
                                : item,
                            )
                          }
                        />
                        {t('publications.loop')}
                      </label>
                    </div>
                  </>
                )}

              </div>
            )}
          </ScrollArea>
        </section>

        <section className="rounded-xl border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">{t('publications.preview')}</h2>
          <PublicationItemPreview
            item={selectedItem}
            assets={assets}
            imageOnlyLabel={t('publications.imageOnlySlide')}
          />

          {selectedItem?.type === 'custom_slide' && !selectedItem.slide.imageAssetId ? (
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <ImageOff className="size-4" />
              {t('publications.previewNoImage')}
            </div>
          ) : null}

          {selectedItem?.type === 'video_asset' && !selectedItem.video.assetId ? (
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Video className="size-4" />
              {t('publications.previewNoVideo')}
            </div>
          ) : null}
        </section>
      </div>

      {editorState.items.length === 0 ? (
        <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          <div className="flex items-center justify-center gap-2">
            <FileImage className="size-4" />
            <span>{t('publications.noItems')}</span>
          </div>
          <div className="mt-3 flex items-center justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => addItem('custom_slide')}>
              {t('publications.addSlide')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => addItem('video_asset')}>
              {t('publications.addVideoItem')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
