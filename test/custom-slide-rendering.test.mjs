import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getSlideImageClassName,
  normalizeSlideImageFitMode,
  resolveSlidePresentation,
} from '../src/features/content/custom-slide-rendering.ts';

test('preview renderer maps image fit modes to deterministic classes', () => {
  assert.equal(getSlideImageClassName('cover'), 'absolute inset-0 h-full w-full object-cover');
  assert.equal(getSlideImageClassName('contain'), 'absolute inset-0 h-full w-full object-contain');
  assert.equal(getSlideImageClassName('stretch'), 'absolute inset-0 h-full w-full object-fill');
  assert.match(getSlideImageClassName('center'), /object-none/);
});

test('image-only slides stay clean when overlay is disabled', () => {
  const model = resolveSlidePresentation({
    title: 'Ignored',
    body: 'Ignored',
    image_fit: 'cover',
    text_overlay: false,
  });

  assert.equal(model.imageFit, 'cover');
  assert.equal(model.renderTextOverlay, false);
});

test('text overlay mode keeps predictable defaults for legacy and contain/cover modes', () => {
  const coverLegacy = resolveSlidePresentation({
    title: 'Headline',
    body: 'Body',
  });
  const containOverlay = resolveSlidePresentation({
    title: 'Headline',
    body: 'Body',
    image_fit: 'contain',
    text_overlay: true,
  });

  assert.equal(coverLegacy.imageFit, 'cover');
  assert.equal(coverLegacy.renderTextOverlay, true);
  assert.equal(containOverlay.imageFit, 'contain');
  assert.equal(containOverlay.renderTextOverlay, true);
  assert.equal(normalizeSlideImageFitMode(undefined), 'cover');
});
