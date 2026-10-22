import { isAllowedTierImage } from '@/lib/tier-list';

const MAX_BYTES = 5 * 1024 * 1024;

// Same-origin copy of a poster so the tier list PNG export can read its pixels.
// Strict host allowlist and no redirects: this is not a general-purpose proxy.
export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get('url') ?? '';
  if (!isAllowedTierImage(url)) return new Response('Forbidden', { status: 403, headers: { 'Cache-Control': 'no-store' } });
  let upstream: Response;
  try { upstream = await fetch(url, { redirect: 'error', cache: 'force-cache', signal: AbortSignal.timeout(10000) }); }
  catch { return new Response('Bad gateway', { status: 502, headers: { 'Cache-Control': 'no-store' } }); }
  const type = upstream.headers.get('content-type') ?? '';
  const length = Number(upstream.headers.get('content-length') ?? 0);
  if (!upstream.ok || !/^image\/(jpeg|png|webp|gif|avif)$/.test(type.split(';')[0].trim()) || length > MAX_BYTES) {
    return new Response('Bad gateway', { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
  const body = await upstream.arrayBuffer();
  if (body.byteLength > MAX_BYTES) return new Response('Bad gateway', { status: 502, headers: { 'Cache-Control': 'no-store' } });
  return new Response(body, { headers: {
    'Content-Type': type, 'Cache-Control': 'public, s-maxage=86400, max-age=86400, immutable', 'X-Content-Type-Options': 'nosniff',
  } });
}
