import { revalidateTag } from 'next/cache';
import { authorizedCron } from '@/lib/cron-auth';
import { refreshSimilarCatalogs } from '@/lib/discovery-data';

// Daily Vercel cron (see vercel.json), after the 06:00 UTC /api/revalidate run
// that expires the seasonal catalog. AniList calls go through the shared rate
// limiter: ~10 seasonal pages + 5 batched popular pages, well within 300 s.
export const maxDuration = 300;
// Same region as the other cron writers: the runtime cache is regional.
export const preferredRegion = 'iad1';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!authorizedCron(request)) return Response.json({ error: 'unauthorized' }, { status: 401, headers: { 'cache-control': 'no-store' } });
  const started = Date.now();
  try {
    // 'max' = stale-while-revalidate: the old catalog keeps serving and is
    // only replaced by a successful crawl (failed loaders are never cached).
    const counts = await refreshSimilarCatalogs(tag => revalidateTag(tag, 'max'));
    return Response.json({ status: 'ok', ...counts, ms: Date.now() - started }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    console.error('[similar-catalog] refresh failed', error);
    return Response.json({ status: 'failed', ms: Date.now() - started }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
}
