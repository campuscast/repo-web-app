import { NextRequest, NextResponse } from 'next/server';
import { normalizeEmbeddedSlideUrl, rewriteExternalSlideHtml } from '@/features/content/external-slide-preview';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const FORWARDED_REQUEST_HEADERS = ['accept', 'accept-language', 'user-agent'] as const;
const BLOCKED_RESPONSE_HEADERS = new Set([
  'cache-control',
  'content-encoding',
  'content-length',
  'content-security-policy',
  'content-security-policy-report-only',
  'cross-origin-embedder-policy',
  'cross-origin-opener-policy',
  'cross-origin-resource-policy',
  'frame-options',
  'set-cookie',
  'set-cookie2',
  'transfer-encoding',
  'x-frame-options',
]);

function buildForwardHeaders(request: NextRequest) {
  const headers = new Headers();

  for (const headerName of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(headerName);
    if (value) {
      headers.set(headerName, value);
    }
  }

  if (!headers.has('accept')) {
    headers.set('accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
  }

  if (!headers.has('user-agent')) {
    headers.set(
      'user-agent',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
    );
  }

  return headers;
}

function buildPassthroughHeaders(upstreamHeaders: Headers, contentTypeOverride?: string) {
  const headers = new Headers();

  upstreamHeaders.forEach((value, key) => {
    if (!BLOCKED_RESPONSE_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });

  if (contentTypeOverride) {
    headers.set('Content-Type', contentTypeOverride);
  }

  headers.set('Cache-Control', 'no-store');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('X-Robots-Tag', 'noindex, nofollow');

  return headers;
}

function buildErrorResponse(message: string, status = 502) {
  const body = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#f8fafc;color:#0f172a;font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;"><div style="max-width:32rem;padding:24px;text-align:center;"><strong style="display:block;margin-bottom:8px;">External slide preview is unavailable.</strong><span>${message}</span></div></body></html>`;

  return new NextResponse(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/html; charset=utf-8',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

export async function GET(request: NextRequest) {
  const targetUrl = normalizeEmbeddedSlideUrl(request.nextUrl.searchParams.get('url') || '');
  if (!targetUrl) {
    return buildErrorResponse('Provide a valid `http://` or `https://` URL.', 400);
  }

  let upstreamResponse: Response;

  try {
    upstreamResponse = await fetch(targetUrl, {
      headers: buildForwardHeaders(request),
      redirect: 'follow',
      cache: 'no-store',
    });
  } catch {
    return buildErrorResponse('The remote page could not be fetched from the preview proxy.');
  }

  if (!upstreamResponse.ok) {
    return buildErrorResponse(`The remote page responded with HTTP ${upstreamResponse.status}.`, upstreamResponse.status);
  }

  const contentType = upstreamResponse.headers.get('content-type') || 'text/html; charset=utf-8';
  if (!contentType.toLowerCase().includes('text/html')) {
    const body = await upstreamResponse.arrayBuffer();
    return new NextResponse(body, {
      status: upstreamResponse.status,
      headers: buildPassthroughHeaders(upstreamResponse.headers, contentType),
    });
  }

  const html = rewriteExternalSlideHtml(await upstreamResponse.text(), upstreamResponse.url);

  return new NextResponse(html, {
    status: upstreamResponse.status,
    headers: buildPassthroughHeaders(upstreamResponse.headers, 'text/html; charset=utf-8'),
  });
}
