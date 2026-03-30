import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getCalendarSegmentGeometry,
  resolveCalendarResizePreview,
  shouldShowTimelineResizeHandles,
} from '../src/features/schedules/schedule-editor-interactions.ts';

function almostEqual(actual, expected, epsilon = 1e-9) {
  return Math.abs(actual - expected) <= epsilon;
}

function makeSlot(overrides = {}) {
  return {
    slot_id: 'slot-1',
    publication_id: '',
    asset_id: 'asset-1',
    start_time: '2026-04-02T06:00:00.000Z',
    end_time: '2026-04-04T07:00:00.000Z',
    priority: 1,
    group_id: '',
    zone_id: 'zone-1',
    metadata: {},
    ...overrides,
  };
}

test('timeline selected slot shows resize handles exclusively', () => {
  assert.equal(
    shouldShowTimelineResizeHandles({
      selectedSlotId: 'slot-a',
      slotId: 'slot-a',
      hasEditableLock: true,
      clipped: false,
    }),
    true,
  );

  assert.equal(
    shouldShowTimelineResizeHandles({
      selectedSlotId: 'slot-a',
      slotId: 'slot-b',
      hasEditableLock: true,
      clipped: false,
    }),
    false,
  );
});

test('timeline selection change removes previous handle ownership', () => {
  const before = shouldShowTimelineResizeHandles({
    selectedSlotId: 'slot-a',
    slotId: 'slot-a',
    hasEditableLock: true,
    clipped: false,
  });
  const after = shouldShowTimelineResizeHandles({
    selectedSlotId: 'slot-b',
    slotId: 'slot-a',
    hasEditableLock: true,
    clipped: false,
  });

  assert.equal(before, true);
  assert.equal(after, false);
});

test('calendar segment geometry keeps predictable left/right bounds', () => {
  const oneDay = getCalendarSegmentGeometry({ startCol: 0, endCol: 1 });
  assert.equal(oneDay.leftPercent, 0);
  assert.equal(almostEqual(oneDay.widthPercent, 100 / 7), true);
  assert.equal(oneDay.insetPx, 4);

  const multiDay = getCalendarSegmentGeometry({ startCol: 2, endCol: 5 });
  assert.equal(almostEqual(multiDay.leftPercent, (2 / 7) * 100), true);
  assert.equal(almostEqual(multiDay.widthPercent, (3 / 7) * 100), true);
});

test('calendar resize preview updates slot bounds during active drag', () => {
  const slot = makeSlot();
  const startPreview = resolveCalendarResizePreview({
    slot,
    edge: 'start',
    targetDate: '2026-04-01',
  });
  assert.ok(startPreview);
  assert.equal(startPreview.start_time.slice(0, 10), '2026-04-01');
  assert.equal(startPreview.end_time, slot.end_time);

  const endPreview = resolveCalendarResizePreview({
    slot,
    edge: 'end',
    targetDate: '2026-04-06',
  });
  assert.ok(endPreview);
  assert.equal(endPreview.start_time, slot.start_time);
  assert.equal(endPreview.end_time.slice(0, 10), '2026-04-06');
});
