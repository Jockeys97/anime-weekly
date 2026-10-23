import { revalidateTag } from 'next/cache';
import { authorizedCron } from '@/lib/cron-auth';
import { getDiscoveryCatalog, getSimilarCatalog, warmSimilarCatalogs, SIMILAR_CATALOG_TAG } from '@/lib/discovery-data';
import type { AniListAnime } from '@/lib/anilist';
import { discoveryCandidate } from '@/lib/anilist-discovery-query';

// Daily Vercel cron (see vercel.json), after the 06:00 UTC /api/revalidate run
// that expires the seasonal catalog. Pages read through this same API bundle,
// so cron writes and page reads use identical unstable_cache loader keys.
export const maxDuration = 300;
// Match the page runtime's region.
export const preferredRegion = 'iad1';
export const dynamic = 'force-dynamic';

function sharedCandidate(anime: AniListAnime) {
  // Match the compact popular-catalog payload. Seasonal descriptions and
  // recommendations are unnecessary for ranking and can exceed fetch-cache
  // entry limits when combined with the 500 all-time candidates.
  const { id, idMal, title, coverImage, genres, averageScore, format, status,
    season, seasonYear, popularity, isAdult, tags, relations } = anime;
  return discoveryCandidate({ id, idMal, title, coverImage, genres, averageScore,
    format, status, season, seasonYear, popularity, isAdult, tags, relations });
}

export async function GET(request: Request) {
  if (!authorizedCron(request)) return Response.json({ error: 'unauthorized' }, { status: 401, headers: { 'cache-control': 'no-store' } });
  const catalog = new URL(request.url).searchParams.get('catalog');
  if (catalog !== null) {
    if (catalog !== 'full' && catalog !== 'seasonal') return Response.json({ error: 'invalid catalog' }, { status: 400 });
    try {
      // Read-only: never invalidate on a catalog request. HTTP caching lives in
      // the caller's tagged Next fetch cache, not a second untagged CDN cache.
      const media = await (catalog === 'full' ? getSimilarCatalog() : getDiscoveryCatalog());
      return Response.json({ media: media.map(sharedCandidate) }, { headers: { 'cache-control': 'no-store' } });
    } catch (error) {
      console.error('[similar-catalog] read failed', error);
      return Response.json({ error: 'catalog unavailable' }, { status: 503, headers: { 'cache-control': 'no-store' } });
    }
  }
  const started = Date.now();
  try {
    // 'max' = stale-while-revalidate: the old catalog keeps serving and is
    // only replaced by a successful crawl (failed loaders are never cached).
    revalidateTag(SIMILAR_CATALOG_TAG, 'max');
    const counts = await warmSimilarCatalogs();
    return Response.json({ status: 'ok', ...counts, ms: Date.now() - started }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    console.error('[similar-catalog] refresh failed', error);
    return Response.json({ status: 'failed', ms: Date.now() - started }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
}
