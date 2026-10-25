import { animeName } from '@/lib/anilist';
import { getAnimeWithSnapshot } from '@/lib/anilist-resilient';
import { getAnimeLocalizedTitles } from '@/lib/anime-localized-titles';
import { animePath } from '@/lib/anime-url';
import { localePath } from '@/lib/locale-routing';
import { isLocale } from '@/lib/locales';

// Bare numeric detail URLs (/anime/123, /en/anime/123) are rewritten here by
// proxy.ts. Unlike the ISR page, a route handler can answer a transient
// AniList 429/timeout with an uncached 503 + Retry-After instead of an HTTP 500
// from error.tsx, and the resolved 308 is CDN-cached without an ISR render.
// The saved daily snapshot is read first, so most titles never touch AniList.
const NOT_FOUND_HTML = '<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>404</title><p>Anime not found. <a href="/">weeklyanime.com</a></p>';
const UNAVAILABLE_HTML = '<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="20"><title>503</title><p>Temporarily unavailable, retrying shortly…</p>';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const requested = new URL(request.url).searchParams.get('locale');
  const locale = isLocale(requested) ? requested : 'it';
  const numericId = Number(id);
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(numericId) || numericId > 2147483647) {
    return new Response(NOT_FOUND_HTML, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, s-maxage=86400' } });
  }
  let anime: Awaited<ReturnType<typeof getAnimeWithSnapshot>>;
  try { anime = await getAnimeWithSnapshot(numericId); }
  catch (error) {
    console.warn('[anime-redirect] transient lookup failure', { id: numericId, message: error instanceof Error ? error.message : 'Unknown error' });
    return new Response(UNAVAILABLE_HTML, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '120' } });
  }
  if (!anime) {
    // Confirmed AniList not-found only; cache briefly in case an id appears.
    return new Response(NOT_FOUND_HTML, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, s-maxage=3600' } });
  }
  const names = await getAnimeLocalizedTitles(anime.id, animeName(anime));
  const path = localePath(animePath(anime.id, names[locale] || animeName(anime)), locale);
  const location = new URL(path, request.url);
  return new Response(null, { status: 308, headers: { Location: location.href, 'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800' } });
}
