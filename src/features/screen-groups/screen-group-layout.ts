import type { ScreenGroupLayoutItem } from '@/types/api';

const DISPLAY_GAP = 180;
const DEVICE_GAP = 320;
const UNSAVED_CLUSTER_GAP = 420;
export const SCREEN_GROUP_CANVAS_PADDING = 240;

export type ScreenGroupComposerDevice = {
  device_id: string;
  device_name: string;
  online?: boolean | null;
};

export type ScreenGroupComposerRuntime = {
  displays?: Array<{
    id: string;
    label: string;
    width: number;
    height: number;
    selected: boolean;
  }>;
};

export type ScreenGroupComposerItem = ScreenGroupLayoutItem & {
  key: string;
  device_name: string;
  display_label: string;
  online: boolean;
  selected: boolean;
  has_saved_position: boolean;
};

export type ScreenGroupLayoutBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
};

export function makeScreenGroupLayoutKey(deviceId: string, displayId: string) {
  return `${deviceId}::${displayId}`;
}

function sortComposerItems(items: ScreenGroupComposerItem[]) {
  return [...items].sort((left, right) => {
    if (left.device_name !== right.device_name) {
      return left.device_name.localeCompare(right.device_name, 'ru');
    }

    if (left.device_id !== right.device_id) {
      return left.device_id.localeCompare(right.device_id);
    }

    if (left.selected !== right.selected) {
      return left.selected ? -1 : 1;
    }

    return left.display_label.localeCompare(right.display_label, 'ru');
  });
}

export function autoLayoutScreenGroupItems(items: ScreenGroupComposerItem[]) {
  const sorted = sortComposerItems(items);
  const positioned: ScreenGroupComposerItem[] = [];
  let currentY = 0;

  for (let index = 0; index < sorted.length; index += 1) {
    const item = sorted[index];
    let currentX = 0;
    let rowHeight = 0;
    const deviceItems = sorted.filter((entry) => entry.device_id === item.device_id);

    if (positioned.some((entry) => entry.device_id === item.device_id)) {
      continue;
    }

    for (const deviceItem of deviceItems) {
      positioned.push({
        ...deviceItem,
        x: currentX,
        y: currentY,
      });
      currentX += deviceItem.width + DISPLAY_GAP;
      rowHeight = Math.max(rowHeight, deviceItem.height);
    }

    currentY += rowHeight + DEVICE_GAP;
  }

  return positioned;
}

export function getScreenGroupLayoutBounds(items: Array<Pick<ScreenGroupComposerItem, 'x' | 'y' | 'width' | 'height'>>): ScreenGroupLayoutBounds {
  if (!items.length) {
    return {
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
      width: 0,
      height: 0,
    };
  }

  const minX = Math.min(...items.map((item) => item.x));
  const minY = Math.min(...items.map((item) => item.y));
  const maxX = Math.max(...items.map((item) => item.x + item.width));
  const maxY = Math.max(...items.map((item) => item.y + item.height));

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  };
}

export function buildScreenGroupComposerItems({
  devices,
  runtimes,
  savedLayoutItems,
}: {
  devices: ScreenGroupComposerDevice[];
  runtimes: Map<string, ScreenGroupComposerRuntime | undefined>;
  savedLayoutItems: ScreenGroupLayoutItem[];
}) {
  const savedLayoutMap = new Map(
    savedLayoutItems.map((item) => [makeScreenGroupLayoutKey(item.device_id, item.display_id), item]),
  );

  const liveItems = sortComposerItems(
    devices.flatMap((device) => {
      const runtime = runtimes.get(device.device_id);
      const displays = Array.isArray(runtime?.displays) ? runtime.displays : [];

      return displays
        .filter((display) => display.width > 0 && display.height > 0)
        .map((display) => {
          const key = makeScreenGroupLayoutKey(device.device_id, display.id);
          const savedItem = savedLayoutMap.get(key);

          return {
            key,
            device_id: device.device_id,
            device_name: device.device_name,
            display_id: display.id,
            display_label: display.label || display.id,
            width: display.width,
            height: display.height,
            x: savedItem?.x ?? 0,
            y: savedItem?.y ?? 0,
            online: device.online === true,
            selected: display.selected,
            has_saved_position: Boolean(savedItem),
          } as ScreenGroupComposerItem;
        });
    }),
  );

  if (!liveItems.length) {
    return [];
  }

  const savedItems = liveItems.filter((item) => item.has_saved_position);
  if (savedItems.length === liveItems.length) {
    return liveItems;
  }

  const unsavedItems = liveItems.filter((item) => !item.has_saved_position);
  if (!savedItems.length) {
    return autoLayoutScreenGroupItems(liveItems);
  }

  const autoPlacedUnsavedItems = autoLayoutScreenGroupItems(unsavedItems);
  const savedBounds = getScreenGroupLayoutBounds(savedItems);
  const unsavedBounds = getScreenGroupLayoutBounds(autoPlacedUnsavedItems);
  const offsetX = savedBounds.maxX - unsavedBounds.minX + UNSAVED_CLUSTER_GAP;
  const offsetY = savedBounds.minY - unsavedBounds.minY;
  const positionedUnsavedItems = new Map(
    autoPlacedUnsavedItems.map((item) => [
      item.key,
      {
        ...item,
        x: item.x + offsetX,
        y: item.y + offsetY,
      },
    ]),
  );

  return liveItems.map((item) => positionedUnsavedItems.get(item.key) ?? item);
}

export function mergeScreenGroupComposerItems(
  currentItems: ScreenGroupComposerItem[],
  nextItems: ScreenGroupComposerItem[],
) {
  if (!currentItems.length) {
    return nextItems;
  }

  const currentItemMap = new Map(currentItems.map((item) => [item.key, item]));
  return nextItems.map((item) => {
    const current = currentItemMap.get(item.key);
    if (!current) {
      return item;
    }

    return {
      ...item,
      x: current.x,
      y: current.y,
    };
  });
}

export function toPersistedScreenGroupLayout(items: Array<Pick<ScreenGroupComposerItem, 'device_id' | 'display_id' | 'x' | 'y' | 'width' | 'height'>>) {
  return [...items]
    .map((item) => ({
      device_id: item.device_id,
      display_id: item.display_id,
      x: Math.round(item.x),
      y: Math.round(item.y),
      width: Math.max(0, Math.round(item.width)),
      height: Math.max(0, Math.round(item.height)),
    }))
    .sort((left, right) => {
      if (left.device_id !== right.device_id) {
        return left.device_id.localeCompare(right.device_id);
      }

      return left.display_id.localeCompare(right.display_id);
    });
}

export function serializeScreenGroupLayout(items: Array<Pick<ScreenGroupComposerItem, 'device_id' | 'display_id' | 'x' | 'y' | 'width' | 'height'>>) {
  return JSON.stringify(toPersistedScreenGroupLayout(items));
}

export function computeScreenGroupViewportScale({
  bounds,
  viewportWidth,
  viewportHeight,
}: {
  bounds: ScreenGroupLayoutBounds;
  viewportWidth: number;
  viewportHeight: number;
}) {
  if (!bounds.width || !bounds.height || !viewportWidth || !viewportHeight) {
    return 1;
  }

  const availableWidth = Math.max(1, viewportWidth - SCREEN_GROUP_CANVAS_PADDING);
  const availableHeight = Math.max(1, viewportHeight - SCREEN_GROUP_CANVAS_PADDING);
  const scale = Math.min(
    1,
    availableWidth / bounds.width,
    availableHeight / bounds.height,
  );

  return Math.max(0.08, Number.isFinite(scale) ? scale : 1);
}
