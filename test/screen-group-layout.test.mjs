import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildScreenGroupComposerItems,
  mergeScreenGroupComposerItems,
  serializeScreenGroupLayout,
} from '../src/features/screen-groups/screen-group-layout.ts';

test('buildScreenGroupComposerItems keeps saved positions and auto-places new displays to the right', () => {
  const items = buildScreenGroupComposerItems({
    devices: [
      { device_id: 'device-a', device_name: 'Alpha', online: true },
      { device_id: 'device-b', device_name: 'Beta', online: true },
    ],
    runtimes: new Map([
      ['device-a', { displays: [{ id: 'display-1', label: 'Main', width: 1920, height: 1080, selected: true }] }],
      ['device-b', { displays: [{ id: 'display-2', label: 'Right', width: 1080, height: 1920, selected: false }] }],
    ]),
    savedLayoutItems: [
      { device_id: 'device-a', display_id: 'display-1', x: 120, y: 40, width: 1920, height: 1080 },
    ],
  });

  assert.equal(items.length, 2);
  assert.equal(items[0].x, 120);
  assert.equal(items[0].y, 40);
  assert.ok(items[1].x > items[0].x + items[0].width);
});

test('mergeScreenGroupComposerItems preserves user positions when runtime metadata refreshes', () => {
  const currentItems = [
    {
      key: 'device-a::display-1',
      device_id: 'device-a',
      device_name: 'Alpha',
      display_id: 'display-1',
      display_label: 'Main',
      width: 1920,
      height: 1080,
      x: 800,
      y: 240,
      online: true,
      selected: true,
      has_saved_position: true,
    },
  ];
  const nextItems = [
    {
      ...currentItems[0],
      width: 1366,
      height: 768,
      x: 0,
      y: 0,
    },
  ];

  const merged = mergeScreenGroupComposerItems(currentItems, nextItems);
  assert.equal(merged[0].x, 800);
  assert.equal(merged[0].y, 240);
  assert.equal(merged[0].width, 1366);
  assert.equal(merged[0].height, 768);
});

test('serializeScreenGroupLayout is stable regardless of input order', () => {
  const first = serializeScreenGroupLayout([
    { device_id: 'device-b', display_id: 'display-2', x: 400, y: 0, width: 1080, height: 1920 },
    { device_id: 'device-a', display_id: 'display-1', x: 0, y: 0, width: 1920, height: 1080 },
  ]);
  const second = serializeScreenGroupLayout([
    { device_id: 'device-a', display_id: 'display-1', x: 0, y: 0, width: 1920, height: 1080 },
    { device_id: 'device-b', display_id: 'display-2', x: 400, y: 0, width: 1080, height: 1920 },
  ]);

  assert.equal(first, second);
});
