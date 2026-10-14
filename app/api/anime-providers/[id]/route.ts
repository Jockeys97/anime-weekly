import { getAnime } from '@/lib/anilist';
import { getAnimeAvailability } from '@/lib/tmdb';
export const revalidate = 86400;
// Filter metadata must never trigger rating enrichment.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id) || Number(id) > 2147483647) return new Response('Invalid anime id', { status: 400 });
  try {
    const anime = await getAnime(Number(id));
    if (!anime) return new Response('Anime unavailable', { status: 404 });
    const aliases = [anime.title.english, anime.title.romaji, anime.title.native].filter((value): value is string => Boolean(value));
    const kind = anime.format === 'MOVIE' ? 'movie' : ['TV', 'TV_SHORT', 'ONA'].includes(anime.format ?? '') ? 'tv' : undefined;
    const result = await getAnimeAvailability(aliases, anime.startDate?.year ?? anime.seasonYear ?? undefined, kind, false, true);
    if (result.ratings.imdbStatus === 'error') return new Response('Providers unavailable', { status: 503 });
    return Response.json({ providers: result.providers }, { status: result.providersUnavailable ? 503 : 200, headers: { 'Cache-Control': result.providersUnavailable ? 'no-store' : 'public, max-age=3600' } });
  } catch { return new Response('Providers unavailable', { status: 503 }); }
}
