import { getAnime, animeName } from '@/lib/anilist';
import { getCachedDetailAvailability } from '@/lib/detail-availability';
import { recoverJustWatchOffers } from '@/lib/justwatch-recovery';
import { STREAMING_REGIONS, type StreamingRegion } from '@/lib/config';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const id = Number(params.get('anime'));
  const region = params.get('region') as StreamingRegion;
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647 || !STREAMING_REGIONS.includes(region)) return Response.json({}, { status: 400 });
  const anime = await getAnime(id);
  if (!anime) return Response.json({}, { status: 404 });
  const watch = await getCachedDetailAvailability(anime);
  const source = watch.seriesWatch || (watch.match ? { ...watch.match, name: animeName(anime), providers: watch.providers } : null);
  if (!source || source.kind !== 'tv' || !watch.ratings.imdbId) return Response.json({}, { headers: { 'Cache-Control': 'no-store' } });
  const availability = await recoverJustWatchOffers(source.name, watch.ratings.imdbId, region);
  return Response.json(availability ? { ...source, providers: { [region]: availability }, providersUnavailable: false, series: Boolean(watch.seriesWatch), recovered: true } : {}, {
    headers: { 'Cache-Control': availability ? 'public, max-age=60, s-maxage=3600' : 'no-store' },
  });
}
