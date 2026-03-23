import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hasSlideTextContent,
  removeItemAndResolveSelection,
  resolveSelectedItemId,
  shouldRenderSlideTextOverlay,
  toApiSlideData,
  toEditorSlideData,
} from '../src/features/content/publication-editor-state.ts';

test('slide model supports image-only variant through text_overlay=false', () => {
  const editorSlide = toEditorSlideData({
    image_asset_id: 'asset-image',
    title: '',
    body: '',
    image_fit: 'contain',
    text_overlay: false,
  });

  assert.equal(editorSlide.imageAssetId, 'asset-image');
  assert.equal(editorSlide.imageFit, 'contain');
  assert.equal(editorSlide.showTextOverlay, false);
  assert.equal(hasSlideTextContent(editorSlide), false);
  assert.equal(shouldRenderSlideTextOverlay(editorSlide), false);

  const apiSlide = toApiSlideData(editorSlide);
  assert.equal(apiSlide.text_overlay, false);
  assert.equal(apiSlide.image_asset_id, 'asset-image');
  assert.equal(apiSlide.image_fit, 'contain');
});

test('legacy slide payloads default to full-screen cover fit', () => {
  const editorSlide = toEditorSlideData({
    image_asset_id: 'asset-image',
    title: 'Legacy',
  });

  assert.equal(editorSlide.layout, 'centered');
  assert.equal(editorSlide.imageFit, 'cover');
  assert.equal(editorSlide.showTextOverlay, true);
});

test('remove action removes the exact item and keeps selection when selected item is not removed', () => {
  const items = [{ itemId: 'a' }, { itemId: 'b' }, { itemId: 'c' }];
  const next = removeItemAndResolveSelection(items, 'b', 'c');

  assert.deepEqual(next.items.map((item) => item.itemId), ['a', 'b']);
  assert.equal(next.selectedItemId, 'b');
});

test('selection moves to a neighbor when deleting selected item', () => {
  const items = [{ itemId: 'a' }, { itemId: 'b' }, { itemId: 'c' }];

  const removeMiddle = removeItemAndResolveSelection(items, 'b', 'b');
  assert.deepEqual(removeMiddle.items.map((item) => item.itemId), ['a', 'c']);
  assert.equal(removeMiddle.selectedItemId, 'c');

  const removeLast = removeItemAndResolveSelection(items, 'c', 'c');
  assert.deepEqual(removeLast.items.map((item) => item.itemId), ['a', 'b']);
  assert.equal(removeLast.selectedItemId, 'b');
});

test('selection id stays stable on normal item field edits', () => {
  const originalItems = [
    { itemId: 'item-1', title: 'One' },
    { itemId: 'item-2', title: 'Two' },
  ];
  const editedItems = [
    { itemId: 'item-1', title: 'One edited' },
    { itemId: 'item-2', title: 'Two' },
  ];

  const nextSelectedItemId = resolveSelectedItemId(editedItems, 'item-1');
  assert.equal(nextSelectedItemId, 'item-1');

  const fallbackSelectedItemId = resolveSelectedItemId(editedItems, '');
  assert.equal(fallbackSelectedItemId, 'item-1');

  const emptySelectedItemId = resolveSelectedItemId([], 'item-1');
  assert.equal(emptySelectedItemId, '');

  assert.notDeepEqual(originalItems, editedItems);
});
