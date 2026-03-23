export type SlideLayout = 'centered' | 'split' | 'title-top';
export type SlideImageFitMode = 'cover' | 'contain' | 'stretch' | 'center';

const DEFAULT_SLIDE_BACKGROUND = '#0f172a';

function normalizeSlideLayout(layout?: string): SlideLayout {
  return layout === 'split' || layout === 'title-top' ? layout : 'centered';
}

function normalizeSlideImageFitMode(mode?: string): SlideImageFitMode {
  if (mode === 'contain' || mode === 'stretch' || mode === 'center') {
    return mode;
  }
  return 'cover';
}

export type EditorSlideData = {
  background: string;
  title: string;
  body: string;
  imageAssetId: string;
  logoAssetId: string;
  layout: SlideLayout;
  imageFit: SlideImageFitMode;
  showTextOverlay: boolean;
};

type SlidePayload = {
  background?: string;
  title?: string;
  body?: string;
  image_asset_id?: string;
  logo_asset_id?: string;
  layout?: SlideLayout;
  image_fit?: SlideImageFitMode;
  text_overlay?: boolean;
};

export function toEditorSlideData(slide?: SlidePayload): EditorSlideData {
  return {
    background: slide?.background || DEFAULT_SLIDE_BACKGROUND,
    title: slide?.title || '',
    body: slide?.body || '',
    imageAssetId: slide?.image_asset_id || '',
    logoAssetId: slide?.logo_asset_id || '',
    layout: normalizeSlideLayout(slide?.layout),
    imageFit: normalizeSlideImageFitMode(slide?.image_fit),
    showTextOverlay: slide?.text_overlay ?? true,
  };
}

export function toApiSlideData(slide: EditorSlideData): SlidePayload {
  return {
    background: slide.background,
    title: slide.title,
    body: slide.body,
    image_asset_id: slide.imageAssetId,
    logo_asset_id: slide.logoAssetId,
    layout: slide.layout,
    image_fit: slide.imageFit,
    text_overlay: slide.showTextOverlay,
  };
}

export function hasSlideTextContent(slide: Pick<EditorSlideData, 'title' | 'body'>) {
  return slide.title.trim().length > 0 || slide.body.trim().length > 0;
}

export function shouldRenderSlideTextOverlay(slide: EditorSlideData) {
  return slide.showTextOverlay && hasSlideTextContent(slide);
}

type ItemWithId = {
  itemId: string;
};

export function resolveSelectedItemId<T extends ItemWithId>(items: T[], selectedItemId: string) {
  if (items.length === 0) {
    return '';
  }

  if (selectedItemId && items.some((item) => item.itemId === selectedItemId)) {
    return selectedItemId;
  }

  return items[0].itemId;
}

export function removeItemAndResolveSelection<T extends ItemWithId>(
  items: T[],
  selectedItemId: string,
  removeItemId: string,
) {
  const removedIndex = items.findIndex((item) => item.itemId === removeItemId);
  if (removedIndex < 0) {
    return {
      items,
      selectedItemId: resolveSelectedItemId(items, selectedItemId),
    };
  }

  const nextItems = items.filter((item) => item.itemId !== removeItemId);
  if (nextItems.length === 0) {
    return {
      items: [],
      selectedItemId: '',
    };
  }

  if (selectedItemId !== removeItemId) {
    return {
      items: nextItems,
      selectedItemId: resolveSelectedItemId(nextItems, selectedItemId),
    };
  }

  const neighborIndex = Math.min(removedIndex, nextItems.length - 1);
  return {
    items: nextItems,
    selectedItemId: nextItems[neighborIndex]?.itemId || '',
  };
}
