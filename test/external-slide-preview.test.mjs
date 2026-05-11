import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildExternalSlidePreviewUrl,
  calculateScaledPreviewLayout,
  normalizeEmbeddedSlideUrl,
  normalizePreviewSurfaceSize,
  resolveExternalSlideSource,
  rewriteExternalSlideHtml,
} from '../src/features/content/external-slide-preview.ts';

test('external slide url normalization accepts http and https only', () => {
  assert.equal(normalizeEmbeddedSlideUrl(' https://example.com/path '), 'https://example.com/path');
  assert.equal(normalizeEmbeddedSlideUrl('http://example.com/path'), 'http://example.com/path');
  assert.equal(normalizeEmbeddedSlideUrl('javascript:alert(1)'), '');
  assert.equal(normalizeEmbeddedSlideUrl('file:///tmp/page.html'), '');
});

test('external slide source distinguishes images from web pages', () => {
  assert.deepEqual(resolveExternalSlideSource('https://example.com/hero.webp'), {
    url: 'https://example.com/hero.webp',
    kind: 'image',
  });
  assert.deepEqual(resolveExternalSlideSource('https://example.com/weather'), {
    url: 'https://example.com/weather',
    kind: 'web',
  });
});

test('preview url builder preserves the normalized external url', () => {
  assert.equal(
    buildExternalSlidePreviewUrl('https://example.com/weather?city=moscow'),
    '/api/external-slide-preview?url=https%3A%2F%2Fexample.com%2Fweather%3Fcity%3Dmoscow',
  );
});

test('scaled preview layout keeps a full-size virtual canvas and scales it down to fit', () => {
  const layout = calculateScaledPreviewLayout({ width: 400, height: 225 }, { width: 1920, height: 1080 });

  assert.equal(layout.width, 1920);
  assert.equal(layout.height, 1080);
  assert.equal(layout.frameWidth, 400);
  assert.equal(layout.frameHeight, 225);
  assert.equal(layout.scale, 400 / 1920);
});

test('surface normalization falls back to the default screen size', () => {
  assert.deepEqual(normalizePreviewSurfaceSize({ width: 0, height: NaN }), {
    width: 1920,
    height: 1080,
  });
});

test('html rewrite injects base markup and strips restrictive meta tags', () => {
  const rewritten = rewriteExternalSlideHtml(
    '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'self\'"><base href="https://old.example.com/"></head><body><img src="/logo.png"></body></html>',
    'https://example.com/weather',
  );

  assert.match(rewritten, /<base href="https:\/\/example\.com\/weather">/);
  assert.doesNotMatch(rewritten, /Content-Security-Policy/);
  assert.doesNotMatch(rewritten, /old\.example\.com/);
});
