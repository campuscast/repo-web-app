'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Clapperboard,
  ExternalLink,
  FileImage,
  GripVertical,
  ImageOff,
  LayoutPanelTop,
  Monitor,
  Plus,
  Save,
  Trash2,
  Tv,
  Upload,
  Video,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import useMeasure from 'react-use-measure';
import { toast } from 'sonner';
import { hasRole } from '@/auth/guards';
import { useAuthStore } from '@/auth/store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useLocale } from '@/hooks/use-locale';
import { createClientId } from '@/lib/id';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import { contentService } from '@/services/content-service';
import { publicationService } from '@/services/publication-service';
import { zoneService } from '@/services/zone-service';
import type { ContentAsset, PublicationItem, ScreenGroup, Zone } from '@/types/api';
import {
  toApiItemMetadata,
  toEditorDisplayScope,
  hasSlideTextContent,
  removeItemAndResolveSelection,
  resolveSelectedItemId,
  toApiSlideData,
  toEditorSlideData,
  type DisplayScopeMode,
  type EditorDisplayScope,
  type EditorSlideData,
  type ScreenGroupRenderMode,
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
import {
  buildExternalSlidePreviewUrl,
  calculateScaledPreviewLayout,
  normalizeEmbeddedSlideUrl,
  resolveExternalSlideSource,
  type PreviewSurfaceSize,
} from './external-slide-preview';
import { getScreenGroupLayoutBounds } from '../screen-groups/screen-group-layout';

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
  displayScope: EditorDisplayScope;
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
const HEADER_ZONE_CONTROL_CLASS = 'h-8 w-full sm:w-[220px]';
const COMPACT_CONTROL_CLASS = 'w-full md:max-w-[240px]';
const PREVIEW_GROUP_MAX_WIDTH = 300;
const PREVIEW_GROUP_MAX_HEIGHT = 220;
const PREVIEW_DIALOG_GROUP_MAX_WIDTH = 1080;
const PREVIEW_DIALOG_GROUP_MAX_HEIGHT = 680;
function makeItemId() {
  return createClientId('item');
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
    displayScope: {
      mode: 'single_screen',
      groupId: '',
      groupRenderMode: 'partitioned',
    },
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
    displayScope: {
      mode: 'single_screen',
      groupId: '',
      groupRenderMode: 'partitioned',
    },
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
    displayScope: toEditorDisplayScope(item.metadata ?? {}),
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
    metadata: toApiItemMetadata(item.metadata, item.displayScope),
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
  triggerClassName?: string;
  disabled?: boolean;
};

function AssetSelector({
  assets,
  value,
  onChange,
  placeholder,
  noneLabel,
  triggerClassName = 'w-full',
  disabled = false,
}: AssetSelectorProps) {
  return (
    <Select
      value={value || '__none__'}
      onValueChange={(next) => onChange(next === '__none__' ? '' : next)}
      disabled={disabled}
    >
      <SelectTrigger className={triggerClassName}>
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

function EditorFieldGroup({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-muted/10 p-4">
      <div className="mb-4">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        {description ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function ExternalSlideWebCanvas({
  url,
  title,
  surfaceSize,
}: {
  url: string;
  title: string;
  surfaceSize?: PreviewSurfaceSize;
}) {
  const [viewportRef, viewportBounds] = useMeasure();
  const previewUrl = buildExternalSlidePreviewUrl(url);
  const layout = useMemo(
    () =>
      calculateScaledPreviewLayout(
        {
          width: viewportBounds.width,
          height: viewportBounds.height,
        },
        surfaceSize,
      ),
    [surfaceSize, viewportBounds.height, viewportBounds.width],
  );

  return (
    <div ref={viewportRef} className="absolute inset-0 overflow-hidden bg-white">
      <div
        className="absolute left-1/2 top-1/2 overflow-hidden rounded-[2px] bg-white shadow-[0_0_0_1px_rgba(15,23,42,0.08)]"
        style={{
          width: layout.frameWidth,
          height: layout.frameHeight,
          transform: 'translate(-50%, -50%)',
        }}
      >
        <iframe
          src={previewUrl}
          title={title}
          className="pointer-events-none absolute left-0 top-0 border-0 bg-white"
          style={{
            width: layout.width,
            height: layout.height,
            transform: `scale(${layout.scale})`,
            transformOrigin: 'top left',
          }}
          loading="lazy"
          referrerPolicy="no-referrer"
          sandbox="allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-scripts"
        />
      </div>
    </div>
  );
}

function PublicationItemCanvas({
  item,
  assets,
  className,
  style,
  titleClassName = 'text-lg',
  bodyClassName = 'text-sm',
  previewSurfaceSize,
}: {
  item: EditorPublicationItem;
  assets: ContentAsset[];
  className?: string;
  style?: CSSProperties;
  titleClassName?: string;
  bodyClassName?: string;
  previewSurfaceSize?: PreviewSurfaceSize;
}) {
  if (item.type === 'video_asset') {
    const videoAsset = assets.find((asset) => asset.asset_id === item.video.assetId);
    const videoUrl = assetPreviewUrl(videoAsset);

    return (
      <div className={cn('relative overflow-hidden bg-black', className)} style={style}>
        {videoAsset && videoUrl ? (
          <video
            src={videoUrl}
            className="absolute inset-0 h-full w-full object-cover"
            autoPlay
            muted
            loop={item.video.loop}
            playsInline
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-sm text-white/70">
            <Video className="size-8" />
            <p>No video asset selected</p>
          </div>
        )}
      </div>
    );
  }

  const externalSource = resolveExternalSlideSource(item.slide.externalUrl);
  const imageAsset = assets.find((asset) => asset.asset_id === item.slide.imageAssetId);
  const model = resolveSlidePresentation({
    background: item.slide.background,
    title: item.slide.title,
    body: item.slide.body,
    layout: item.slide.layout,
    image_fit: item.slide.imageFit,
    text_overlay: item.slide.showTextOverlay,
  });
  const imageUrl = externalSource?.kind === 'image' ? externalSource.url : assetPreviewUrl(imageAsset);
  const showTextOverlay = model.renderTextOverlay;
  const showEmbeddedPage = externalSource?.kind === 'web';

  return (
    <div
      className={cn('relative overflow-hidden', className)}
      style={{
        background: model.background,
        ...style,
      }}
    >
      {showEmbeddedPage ? (
        <ExternalSlideWebCanvas
          url={externalSource.url}
          title={item.slide.title || item.title || 'External slide'}
          surfaceSize={previewSurfaceSize}
        />
      ) : imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={model.title || item.title}
          className={getSlideImageClassName(model.imageFit)}
          style={getSlideImageStyle(model.imageFit)}
        />
      ) : null}

      {!showEmbeddedPage && showTextOverlay ? (
        <>
          <div className={getSlideScrimClassName(model.layout)} />
          <div className={getSlideTextLayerClassName(model.layout)}>
            <div className={cn(getSlideTextBlockClassName(model.layout), 'text-white')}>
              {model.title ? <h3 className={cn('font-semibold tracking-tight', titleClassName)}>{model.title}</h3> : null}
              {model.body ? <p className={cn('leading-relaxed text-white/90', bodyClassName)}>{model.body}</p> : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
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

  return (
    <div className="space-y-3">
      <PublicationItemCanvas item={item} assets={assets} className="aspect-video rounded-xl border" />

      <div className="rounded-xl border bg-card p-3">
        <p className="text-sm font-medium">{item.title || 'Untitled slide'}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {formatDurationLabel(item.durationMs)} • transition {item.transition.type}
        </p>
        {resolveExternalSlideSource(item.slide.externalUrl) ? (
          <p className="mt-1 text-xs text-muted-foreground">External slide</p>
        ) : !item.slide.showTextOverlay || !hasSlideTextContent(item.slide) ? (
          <p className="mt-1 text-xs text-muted-foreground">{imageOnlyLabel}</p>
        ) : null}
      </div>
    </div>
  );
}

function ScreenGroupPublicationPreview({
  item,
  assets,
  group,
  zoneName,
  renderMode,
  maxWidth = PREVIEW_GROUP_MAX_WIDTH,
  maxHeight = PREVIEW_GROUP_MAX_HEIGHT,
  minCanvasHeight = 260,
  viewportClassName,
}: {
  item: EditorPublicationItem;
  assets: ContentAsset[];
  group: ScreenGroup | null;
  zoneName: string;
  renderMode: ScreenGroupRenderMode;
  maxWidth?: number;
  maxHeight?: number;
  minCanvasHeight?: number;
  viewportClassName?: string;
}) {
  const [viewportRef, viewportBounds] = useMeasure();

  if (!group) {
    return (
      <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        Выберите группу экранов для предпросмотра.
      </div>
    );
  }

  const layoutItems = (group.layout_items ?? []).filter((entry) => entry.width > 0 && entry.height > 0);
  if (!layoutItems.length) {
    return (
      <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        Для этой группы ещё не сохранена композиция экранов. Сначала соберите её в Screen Groups.
      </div>
    );
  }

  const bounds = getScreenGroupLayoutBounds(layoutItems);
  const availableWidth =
    viewportBounds.width > 0 ? Math.max(1, Math.min(maxWidth, viewportBounds.width - 8)) : maxWidth;
  const availableHeight =
    viewportBounds.height > 0 ? Math.max(1, Math.min(maxHeight, viewportBounds.height - 8)) : maxHeight;
  const scale = Math.min(
    1,
    availableWidth / Math.max(bounds.width, 1),
    availableHeight / Math.max(bounds.height, 1),
  );
  const frameWidth = Math.max(1, bounds.width * scale);
  const frameHeight = Math.max(1, bounds.height * scale);
  const isPartitioned = renderMode === 'partitioned';

  return (
    <div className="space-y-3">
      <div className="rounded-xl border bg-card p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium">{group.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">{zoneName}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{layoutItems.length}</Badge>
            <Badge variant="secondary">{isPartitioned ? 'Partitioned' : 'Duplicated'}</Badge>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-muted/20 p-3">
        <div
          ref={viewportRef}
          className={cn('flex items-center justify-center overflow-auto', viewportClassName)}
          style={{ minHeight: minCanvasHeight }}
        >
          <div
            className="relative"
            style={{ width: frameWidth, height: frameHeight }}
          >
            {layoutItems.map((layoutItem) => {
              const left = (layoutItem.x - bounds.minX) * scale;
              const top = (layoutItem.y - bounds.minY) * scale;
              const width = layoutItem.width * scale;
              const height = layoutItem.height * scale;

              return (
                <div
                  key={`${layoutItem.device_id}:${layoutItem.display_id}`}
                  className="absolute overflow-hidden rounded-lg border border-border/80 bg-card shadow-sm"
                  style={{ left, top, width, height }}
                >
                  {isPartitioned ? (
                    <div
                      style={{
                        width: frameWidth,
                        height: frameHeight,
                        transform: `translate(${-left}px, ${-top}px)`,
                      }}
                    >
                      <PublicationItemCanvas
                        item={item}
                        assets={assets}
                        className="h-full w-full"
                        style={{ width: frameWidth, height: frameHeight }}
                        titleClassName="text-sm"
                        bodyClassName="text-[11px]"
                        previewSurfaceSize={{ width: bounds.width, height: bounds.height }}
                      />
                    </div>
                  ) : (
                    <PublicationItemCanvas
                      item={item}
                      assets={assets}
                      className="h-full w-full"
                      titleClassName="text-xs"
                      bodyClassName="text-[10px]"
                      previewSurfaceSize={{ width: layoutItem.width, height: layoutItem.height }}
                    />
                  )}

                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-2 py-1 text-[10px] font-medium text-white">
                    {layoutItem.display_id}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PublicationEditorPage({ mode, publicationId }: PublicationEditorPageProps) {
  const { t } = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const zoneIdFromQuery = searchParams.get('zone_id') || '';
  const titleFromQuery = searchParams.get('title') || '';
  const typeFromQuery = searchParams.get('type') || '';
  const initialPublicationType = typeFromQuery || 'slideshow';

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
  const [previewModeOverride, setPreviewModeOverride] = useState<DisplayScopeMode | ''>('');
  const [previewZoneId, setPreviewZoneId] = useState('');
  const [previewGroupId, setPreviewGroupId] = useState('');

  const [editorState, setEditorState] = useState<EditorState>({
    zoneId: '',
    title: mode === 'create' ? titleFromQuery || t('publications.createPublication') : '',
    type: initialPublicationType,
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
  const activePreviewMode = previewModeOverride || selectedItem?.displayScope.mode || 'single_screen';
  const activePreviewRenderMode = selectedItem?.displayScope.groupRenderMode ?? 'partitioned';

  const imageAssets = useMemo(
    () => assets.filter((asset) => asset.content_type.startsWith('image/')),
    [assets],
  );

  const videoAssets = useMemo(
    () => assets.filter((asset) => asset.content_type.startsWith('video/')),
    [assets],
  );
  const publicationZoneGroupsQuery = useQuery({
    queryKey: editorState.zoneId ? queryKeys.zoneGroups(editorState.zoneId) : ['zones', 'groups', 'empty'],
    queryFn: () => zoneService.listGroups(editorState.zoneId),
    enabled: Boolean(editorState.zoneId),
  });
  const publicationZoneGroups = publicationZoneGroupsQuery.data ?? [];
  const activePreviewZoneId = visibleZones.some((zone) => zone.zone_id === previewZoneId)
    ? previewZoneId
    : editorState.zoneId || visibleZones[0]?.zone_id || '';
  const previewGroupsQuery = useQuery({
    queryKey: activePreviewZoneId ? queryKeys.zoneGroups(activePreviewZoneId) : ['zones', 'preview-groups', 'empty'],
    queryFn: () => zoneService.listGroups(activePreviewZoneId),
    enabled: Boolean(activePreviewZoneId),
  });
  const previewGroups = previewGroupsQuery.data ?? [];
  const selectedScopeGroup = publicationZoneGroups.find((group) => group.group_id === selectedItem?.displayScope.groupId) ?? null;
  const preferredPreviewGroupId = previewGroupId || (selectedItem?.displayScope.mode === 'screen_group' ? selectedItem.displayScope.groupId : '');
  const activePreviewGroupId = previewGroups.some((group) => group.group_id === preferredPreviewGroupId)
    ? preferredPreviewGroupId
    : previewGroups[0]?.group_id || '';
  const activePreviewGroup = previewGroups.find((group) => group.group_id === activePreviewGroupId) ?? null;
  const activePreviewZoneName = visibleZones.find((zone) => zone.zone_id === activePreviewZoneId)?.name ?? activePreviewZoneId;

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
        title: titleFromQuery || prev.title,
        type: typeFromQuery || prev.type,
        items: prev.items.length > 0 ? prev.items : [makeDefaultSlideItem()],
      }));

      await loadAssets(effectiveZoneId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('publications.toast.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [allowedZones, canRead, isAdmin, loadAssets, mode, publicationId, t, titleFromQuery, typeFromQuery, zoneIdFromQuery]);

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

  const updateSelectedItemDisplayScope = (updater: (scope: EditorDisplayScope) => EditorDisplayScope) => {
    updateSelectedItem((item) => ({
      ...item,
      displayScope: updater(item.displayScope),
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
        const nextDisplayScope = item.displayScope.mode === 'screen_group'
          ? { ...item.displayScope, groupId: '' }
          : item.displayScope;

        if (item.type === 'video_asset') {
          return {
            ...item,
            displayScope: nextDisplayScope,
            video: { ...item.video, assetId: '' },
          };
        }

        return {
          ...item,
          displayScope: nextDisplayScope,
          slide: { ...item.slide, imageAssetId: '' },
        };
      }),
    }));
    setPreviewZoneId(zoneId);
    setPreviewGroupId('');

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
      <div className="rounded-xl border bg-card px-4 py-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="ghost" size="icon-sm" onClick={() => router.push('/publications')}>
              <ArrowLeft className="size-4" />
            </Button>

            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
              <Badge variant="outline" className="w-fit shrink-0">
                {mode === 'create' ? t('publications.create') : editorState.status}
              </Badge>
              {mode === 'create' ? (
                <Input
                  value={editorState.title}
                  onChange={(event) =>
                    setEditorState((prev) => ({
                      ...prev,
                      title: event.target.value,
                    }))
                  }
                  className="h-9 min-w-0 max-w-[560px] text-base font-semibold tracking-tight md:text-base"
                  placeholder={t('publications.createPublication')}
                />
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            {mode === 'create' && visibleZones.length > 0 ? (
              <Select value={editorState.zoneId} onValueChange={handleZoneChange}>
                <SelectTrigger className={HEADER_ZONE_CONTROL_CLASS}>
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
            ) : null}

            <Button variant="outline" size="sm" onClick={() => router.push('/publications')}>
              {t('settings.cancel')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="min-w-[152px]"
              onClick={() => void savePublication()}
              disabled={!canWrite || saving}
            >
              <Save className="mr-1.5 size-4" />
              {saving ? t('publications.saving') : t('publications.savePublication')}
            </Button>
            <Button size="sm" className="min-w-[116px]" onClick={() => void savePublication('active')} disabled={!canWrite || saving}>
              <Upload className="mr-1.5 size-4" />
              {t('publications.publish')}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_360px] xl:items-stretch">
        <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-card">
          <div className="border-b p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">{t('publications.items')}</h2>
              <Badge variant="outline">{editorState.items.length}</Badge>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2">
              <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => addItem('custom_slide')}>
                <Plus className="mr-1 size-4" />
                {t('publications.addSlide')}
              </Button>
              <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => addItem('video_asset')}>
                <Plus className="mr-1 size-4" />
                {t('publications.addVideoItem')}
              </Button>
            </div>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-2 p-3 pb-4">
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

        <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-card">
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

          <ScrollArea className="min-h-0 flex-1">
            {!selectedItem ? (
              <div className="p-6 text-sm text-muted-foreground">
                {t('publications.selectItemHint')}
              </div>
            ) : (
              <div className="space-y-4 p-4 pb-8">
                <EditorFieldGroup
                  title="Item settings"
                  description="Core item identity and timing. Keep title, duration and transition together so sequence behavior is easier to scan."
                >
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
                              displayScope: item.displayScope,
                              metadata: item.metadata,
                            };
                          })
                        }
                      >
                        <SelectTrigger className={COMPACT_CONTROL_CLASS}>
                          <SelectValue />
                        </SelectTrigger>
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
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>{t('publications.duration')}</Label>
                      <Input
                        className={COMPACT_CONTROL_CLASS}
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
                        <SelectTrigger className={COMPACT_CONTROL_CLASS}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cut">cut</SelectItem>
                          <SelectItem value="fade">fade</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>{t('publications.transitionDuration')}</Label>
                      <Input
                        className={COMPACT_CONTROL_CLASS}
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
                </EditorFieldGroup>

                <EditorFieldGroup
                  title="Display targeting"
                  description="Choose whether this item goes to one screen or to a saved screen group, and how the group should render it."
                >
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Display target</Label>
                      <Select
                        value={selectedItem.displayScope.mode}
                        onValueChange={(value: DisplayScopeMode) =>
                          updateSelectedItemDisplayScope((scope) => ({
                            ...scope,
                            mode: value,
                            groupId: value === 'screen_group' ? scope.groupId || publicationZoneGroups[0]?.group_id || '' : '',
                          }))
                        }
                      >
                        <SelectTrigger className={COMPACT_CONTROL_CLASS}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="single_screen">Single screen</SelectItem>
                          <SelectItem value="screen_group">Screen group</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label>Screen group</Label>
                      <Select
                        value={selectedItem.displayScope.groupId}
                        onValueChange={(value) =>
                          updateSelectedItemDisplayScope((scope) => ({
                            ...scope,
                            groupId: value,
                          }))
                        }
                        disabled={selectedItem.displayScope.mode !== 'screen_group' || publicationZoneGroups.length === 0}
                      >
                        <SelectTrigger className={COMPACT_CONTROL_CLASS}>
                          <SelectValue
                            placeholder={
                              publicationZoneGroups.length > 0
                                ? 'Select screen group'
                                : 'No screen groups in this zone'
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {publicationZoneGroups.map((group) => (
                            <SelectItem key={group.group_id} value={group.group_id}>
                              {group.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Group playback</Label>
                      <Select
                        value={selectedItem.displayScope.groupRenderMode}
                        onValueChange={(value: ScreenGroupRenderMode) =>
                          updateSelectedItemDisplayScope((scope) => ({
                            ...scope,
                            groupRenderMode: value,
                          }))
                        }
                        disabled={selectedItem.displayScope.mode !== 'screen_group'}
                      >
                        <SelectTrigger className={COMPACT_CONTROL_CLASS}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="duplicate">Show full item on every screen</SelectItem>
                          <SelectItem value="partitioned">Partition one item across the group</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Single screen keeps the item independent per display. Screen group uses the saved screen composition and unlocks duplicated or partitioned playback.
                    </p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Duplicated means every monitor shows the full slide or video. Partitioned means the group acts as one large canvas and each monitor renders its own slice.
                    </p>
                  </div>

                  {selectedItem.displayScope.mode === 'screen_group' && selectedScopeGroup ? (
                    <div className="flex flex-col gap-3 rounded-lg border bg-background p-3 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{selectedScopeGroup.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Monitor positions come from the Screen Groups composer. Open it when you need to rearrange the physical layout.
                        </p>
                      </div>
                      <Button asChild variant="outline" size="sm">
                        <a
                          href={`/screen-groups/${selectedScopeGroup.group_id}/compose?zoneId=${editorState.zoneId}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <LayoutPanelTop className="size-4" />
                          Edit composition
                          <ExternalLink className="size-3.5" />
                        </a>
                      </Button>
                    </div>
                  ) : null}
                </EditorFieldGroup>

                {selectedItem.type === 'custom_slide' ? (
                  <>
                    <EditorFieldGroup
                      title="Canvas"
                      description="Everything that shapes the slide surface itself: image, background and overall composition."
                    >
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
                            <SelectTrigger className={COMPACT_CONTROL_CLASS}>
                              <SelectValue />
                            </SelectTrigger>
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
                            <SelectTrigger className={COMPACT_CONTROL_CLASS}>
                              <SelectValue />
                            </SelectTrigger>
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
                            className={COMPACT_CONTROL_CLASS}
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
                          triggerClassName="w-full"
                          disabled={Boolean(selectedItem.slide.externalUrl.trim())}
                        />
                        {selectedItem.slide.externalUrl.trim() ? (
                          <p className="text-xs text-muted-foreground">
                            External URL overrides the image asset until you clear it.
                          </p>
                        ) : null}
                      </div>

                      <div className="space-y-1.5">
                        <Label>External slide URL</Label>
                        <Input
                          className="w-full"
                          type="url"
                          placeholder="https://example.com/form"
                          value={selectedItem.slide.externalUrl}
                          onChange={(event) =>
                            updateSelectedItem((item) =>
                              item.type === 'custom_slide'
                                ? { ...item, slide: { ...item.slide, externalUrl: event.target.value } }
                                : item,
                            )
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          Use a full `http://` or `https://` URL to open an external page or web form as the slide itself.
                        </p>
                        {selectedItem.slide.externalUrl.trim() && !normalizeEmbeddedSlideUrl(selectedItem.slide.externalUrl) ? (
                          <p className="text-xs text-destructive">
                            The external slide URL must start with `http://` or `https://`.
                          </p>
                        ) : null}
                      </div>
                    </EditorFieldGroup>

                    <EditorFieldGroup
                      title="Text overlay"
                      description="Headline and supporting copy that sits on top of the visual canvas."
                    >
                      <div className="space-y-1.5">
                        <Label>{t('publications.textOverlay')}</Label>
                        <label className="flex items-center gap-2 rounded-md border bg-background p-2 text-sm">
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
                    </EditorFieldGroup>
                  </>
                ) : (
                  <EditorFieldGroup
                    title="Video playback"
                    description="Playback-specific controls for this item."
                  >
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
                        triggerClassName="w-full"
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>{t('publications.trimIn')}</Label>
                        <Input
                          className={COMPACT_CONTROL_CLASS}
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
                          className={COMPACT_CONTROL_CLASS}
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
                      <label className="flex items-center gap-2 rounded-md border bg-background p-2 text-sm">
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

                      <label className="flex items-center gap-2 rounded-md border bg-background p-2 text-sm">
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
                  </EditorFieldGroup>
                )}

              </div>
            )}
          </ScrollArea>
        </section>

        <section className="rounded-xl border bg-card p-4">
          <div className="mb-3 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">{t('publications.preview')}</h2>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant={activePreviewMode === 'single_screen' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPreviewModeOverride('single_screen')}
                >
                  <Monitor className="size-4" />
                  Screen
                </Button>
                <Button
                  variant={activePreviewMode === 'screen_group' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPreviewModeOverride('screen_group')}
                >
                  <Tv className="size-4" />
                  Group
                </Button>
              </div>
            </div>

            {activePreviewMode === 'screen_group' ? (
              <div className="space-y-3 rounded-xl border bg-muted/10 p-3">
                <div className="space-y-1.5">
                  <Label>Preview zone</Label>
                  <Select
                    value={activePreviewZoneId}
                    onValueChange={(value) => {
                      setPreviewZoneId(value);
                      setPreviewGroupId('');
                    }}
                  >
                    <SelectTrigger className="w-full">
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

                <div className="space-y-1.5">
                  <Label>Preview screen group</Label>
                  <Select
                    value={activePreviewGroupId}
                    onValueChange={setPreviewGroupId}
                    disabled={previewGroups.length === 0}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue
                        placeholder={previewGroups.length > 0 ? 'Select screen group' : 'No screen groups in this zone'}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {previewGroups.map((group) => (
                        <SelectItem key={group.group_id} value={group.group_id}>
                          {group.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Group playback</Label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant={activePreviewRenderMode === 'duplicate' ? 'default' : 'outline'}
                      size="sm"
                      disabled={!selectedItem}
                      onClick={() =>
                        updateSelectedItemDisplayScope((scope) => ({
                          ...scope,
                          groupRenderMode: 'duplicate',
                        }))
                      }
                    >
                      Duplicated
                    </Button>
                    <Button
                      variant={activePreviewRenderMode === 'partitioned' ? 'default' : 'outline'}
                      size="sm"
                      disabled={!selectedItem}
                      onClick={() =>
                        updateSelectedItemDisplayScope((scope) => ({
                          ...scope,
                          groupRenderMode: 'partitioned',
                        }))
                      }
                    >
                      Partitioned
                    </Button>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Duplicated shows the full item on every screen. Partitioned turns the whole group into one canvas and each monitor shows only its own slice.
                  </p>
                </div>

                {activePreviewGroup ? (
                  <div className="flex flex-col gap-3 rounded-lg border bg-background p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{activePreviewGroup.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Change monitor positions in the Screen Groups composer. Preview here always uses the saved composition.
                        </p>
                      </div>
                      <Badge variant="outline">{activePreviewGroup.layout_items.length}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button asChild variant="outline" size="sm">
                        <a
                          href={`/screen-groups/${activePreviewGroup.group_id}/compose?zoneId=${activePreviewZoneId}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <LayoutPanelTop className="size-4" />
                          Edit composition
                          <ExternalLink className="size-3.5" />
                        </a>
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {activePreviewMode === 'screen_group' && selectedItem ? (
            <ScreenGroupPublicationPreview
              item={selectedItem}
              assets={assets}
              group={activePreviewGroup}
              zoneName={activePreviewZoneName}
              renderMode={activePreviewRenderMode}
            />
          ) : (
            <PublicationItemPreview
              item={selectedItem}
              assets={assets}
              imageOnlyLabel={t('publications.imageOnlySlide')}
            />
          )}

          {activePreviewMode === 'screen_group' && activePreviewGroup && selectedItem ? (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" className="mt-3 w-full">
                  <LayoutPanelTop className="size-4" />
                  Open canvas
                </Button>
              </DialogTrigger>
              <DialogContent
                className="max-h-[calc(100vh-2rem)] max-w-[min(1200px,calc(100vw-2rem))] overflow-hidden p-0"
                showCloseButton
              >
                <DialogHeader className="border-b px-5 py-4">
                  <DialogTitle>Group preview canvas</DialogTitle>
                  <DialogDescription>
                    Inspect the publication item against the saved screen composition and current group playback mode.
                  </DialogDescription>
                </DialogHeader>
                <div className="overflow-auto p-5">
                  <ScreenGroupPublicationPreview
                    item={selectedItem}
                    assets={assets}
                    group={activePreviewGroup}
                    zoneName={activePreviewZoneName}
                    renderMode={activePreviewRenderMode}
                    maxWidth={PREVIEW_DIALOG_GROUP_MAX_WIDTH}
                    maxHeight={PREVIEW_DIALOG_GROUP_MAX_HEIGHT}
                    minCanvasHeight={320}
                    viewportClassName="max-h-[calc(100vh-18rem)]"
                  />
                </div>
              </DialogContent>
            </Dialog>
          ) : null}

          {selectedItem?.type === 'custom_slide'
            && selectedItem.slide.externalUrl.trim()
            && !normalizeEmbeddedSlideUrl(selectedItem.slide.externalUrl) ? (
            <div className="mt-3 flex items-center gap-2 text-xs text-destructive">
              <ExternalLink className="size-4" />
              External slide URL must start with `http://` or `https://`.
            </div>
          ) : null}

          {selectedItem?.type === 'custom_slide'
            && !selectedItem.slide.imageAssetId
            && !selectedItem.slide.externalUrl.trim() ? (
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
