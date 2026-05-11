export const DEFAULT_EXTERNAL_PREVIEW_SURFACE = {
  width: 1920,
  height: 1080,
} as const;

const EMBEDDED_URL_PROTOCOLS = new Set(['http:', 'https:']);
const EXTERNAL_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg', '.bmp', '.ico'];
const CSP_META_TAG_PATTERN = /<meta[^>]+http-equiv=(["'])content-security-policy(?:-report-only)?\1[^>]*>/gi;
const BASE_TAG_PATTERN = /<base\b[^>]*>/gi;

export type PreviewSurfaceSize = {
  width: number;
  height: number;
};

export function normalizeEmbeddedSlideUrl(value?: string) {
  const rawValue = String(value || '').trim();
  if (!rawValue) return '';

  try {
    const parsedUrl = new URL(rawValue);
    return EMBEDDED_URL_PROTOCOLS.has(parsedUrl.protocol) ? parsedUrl.toString() : '';
  } catch {
    return '';
  }
}

export function resolveExternalSlideSource(value?: string) {
  const normalizedUrl = normalizeEmbeddedSlideUrl(value);
  if (!normalizedUrl) return null;

  const pathname = new URL(normalizedUrl).pathname.toLowerCase();
  const kind = EXTERNAL_IMAGE_EXTENSIONS.some((extension) => pathname.endsWith(extension)) ? 'image' : 'web';

  return {
    url: normalizedUrl,
    kind,
  } as const;
}

export function buildExternalSlidePreviewUrl(value?: string) {
  const normalizedUrl = normalizeEmbeddedSlideUrl(value);
  if (!normalizedUrl) return '';

  const params = new URLSearchParams({ url: normalizedUrl });
  return `/api/external-slide-preview?${params.toString()}`;
}

export function normalizePreviewSurfaceSize(surface?: Partial<PreviewSurfaceSize> | null): PreviewSurfaceSize {
  const width = Number(surface?.width);
  const height = Number(surface?.height);

  return {
    width: Number.isFinite(width) && width > 0 ? Math.round(width) : DEFAULT_EXTERNAL_PREVIEW_SURFACE.width,
    height: Number.isFinite(height) && height > 0 ? Math.round(height) : DEFAULT_EXTERNAL_PREVIEW_SURFACE.height,
  };
}

export function calculateScaledPreviewLayout(
  viewport: Partial<PreviewSurfaceSize> | null | undefined,
  surface?: Partial<PreviewSurfaceSize> | null,
) {
  const normalizedSurface = normalizePreviewSurfaceSize(surface);
  const viewportWidth = Number(viewport?.width);
  const viewportHeight = Number(viewport?.height);
  const availableWidth = Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : normalizedSurface.width;
  const availableHeight = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : normalizedSurface.height;
  const scale = Math.min(availableWidth / normalizedSurface.width, availableHeight / normalizedSurface.height);

  return {
    width: normalizedSurface.width,
    height: normalizedSurface.height,
    scale: Number.isFinite(scale) && scale > 0 ? scale : 1,
    frameWidth: normalizedSurface.width * (Number.isFinite(scale) && scale > 0 ? scale : 1),
    frameHeight: normalizedSurface.height * (Number.isFinite(scale) && scale > 0 ? scale : 1),
  };
}

function escapeHtmlAttribute(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function rewriteExternalSlideHtml(html: string, sourceUrl: string) {
  const normalizedSourceUrl = normalizeEmbeddedSlideUrl(sourceUrl);
  if (!normalizedSourceUrl) {
    return html;
  }

  const headMarkup = [
    `<base href="${escapeHtmlAttribute(normalizedSourceUrl)}">`,
    '<meta name="referrer" content="no-referrer">',
  ].join('');
  const strippedHtml = html.replace(CSP_META_TAG_PATTERN, '').replace(BASE_TAG_PATTERN, '');

  if (/<head(\s[^>]*)?>/i.test(strippedHtml)) {
    return strippedHtml.replace(/<head(\s[^>]*)?>/i, (match) => `${match}${headMarkup}`);
  }

  if (/<html(\s[^>]*)?>/i.test(strippedHtml)) {
    return strippedHtml.replace(/<html(\s[^>]*)?>/i, (match) => `${match}<head>${headMarkup}</head>`);
  }

  return `<!doctype html><html><head>${headMarkup}</head><body>${strippedHtml}</body></html>`;
}
