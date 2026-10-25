import { revalidateTag } from 'next/cache';
import { authorizedCron } from '@/lib/cron-auth';
import { readSeasonalCatalog, readSimilarCatalog, warmSimilarCatalogs } from '@/lib/similar-catalog-store';
import { readSharedSimilarCatalog, SIMILAR_CATALOG_RESPONSE_TAG } from '@/lib/similar-catalog-client';

// Warmed by the single daily /api/revalidate cron. All modes require CRON_SECRET.
// Reads and writes live in this bundle; a cold read never calls AniList.
export const maxDuration = 300;
// Match the page runtime's region.
export const preferredRegion = 'iad1';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!authorizedCron(request)) return Response.json({ error: 'unauthorized' }, { status: 401, headers: { 'cache-control': 'no-store' } });
  const catalog = new URL(request.url).searchParams.get('catalog');
  if (catalog !== null) {
    if (catalog !== 'full' && catalog !== 'seasonal') return Response.json({ error: 'invalid catalog' }, { status: 400 });
    try {
      // Read-only: never invalidate on a catalog request. HTTP caching lives in
      // the caller's tagged Next fetch cache, not a second untagged CDN cache.
      const media = await (catalog === 'full' ? readSimilarCatalog() : readSeasonalCatalog());
      return Response.json({ media }, { headers: { 'cache-control': 'no-store' } });
    } catch (error) {
      console.error('[similar-catalog] read failed', error);
      return Response.json({ error: 'catalog unavailable' }, { status: 503, headers: { 'cache-control': 'no-store' } });
    }
  }
  const started = Date.now();
  try {
    // TTLs decide whether a crawl is due (seasonal: daily, popular: weekly).
    // Failed loaders never replace the previous successful catalog.
    // Mild Nudity IDs are a committed JSON (data/mal-r-plus.json), not refreshed here.
    const counts = await warmSimilarCatalogs();
    revalidateTag(SIMILAR_CATALOG_RESPONSE_TAG, 'max');
    // Prime the exact authenticated HTTP entries used by pages as well as the
    // API's unstable_cache entries. Existing responses remain available during
    // the crawl; fresh ones can live for up to 7 days, stale ones refresh via SWR.
    // Only the HTTP snapshot tag becomes stale; catalog loader tags stay intact.
    await readSharedSimilarCatalog('full');
    await readSharedSimilarCatalog('seasonal');
    return Response.json({ status: 'ok', ...counts, ms: Date.now() - started }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    console.error('[similar-catalog] refresh failed', error);
    return Response.json({ status: 'failed', ms: Date.now() - started }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
}
