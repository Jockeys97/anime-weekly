import { getAnime } from '@/lib/anilist';
import { getDetailProviders } from '@/lib/detail-availability';
export const revalidate = 86400;
// Filter metadata must never trigger rating enrichment.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id) || Number(id) > 2147483647) return new Response('Invalid anime id', { status: 400 });
  try {
    const anime = await getAnime(Number(id));
    if (!anime) return new Response('Anime unavailable', { status: 404 });
    const result = await getDetailProviders(anime);
    const unavailable = result.providersUnavailable || result.seriesWatch?.providersUnavailable || result.ratings.imdbStatus === 'error'
      || result.ratings.imdbStatus === 'unconfigured' || (!result.match && !result.seriesWatch && !Object.keys(result.providers).length);
    return Response.json({ providers: result.providers, ...(result.seriesWatch ? { seriesWatch: result.seriesWatch } : {}) }, { status: unavailable ? 503 : 200, headers: { 'Cache-Control': unavailable ? 'no-store' : 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800' } });
  } catch { return new Response('Providers unavailable', { status: 503 }); }
}
