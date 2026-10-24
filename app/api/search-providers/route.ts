import { discoverAnime } from '@/lib/anilist';
import { parseAnimeFilters, searchParamsRecord } from '@/lib/anime-search';
import { getAnimePlatformMetadata } from '@/lib/platform-metadata';
export const maxDuration = 30;
// Platforms for one page of search results: the same AniList query as the
// page (served from the fetch cache) and per-title TMDB providers cached hourly.
export async function GET(request: Request) {
  const params = searchParamsRecord(new URL(request.url).searchParams);
  try {
    const data = await discoverAnime(parseAnimeFilters(params));
    if (data.unavailable || !data.media.length) throw new Error('Search unavailable');
    const result = await getAnimePlatformMetadata(data.media);
    return Response.json(result, { headers: { 'Cache-Control': result.unavailable ? 'no-store' : 'public, max-age=60, s-maxage=86400, stale-while-revalidate=604800' } });
  } catch { return Response.json({ error: 'Providers unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
