import { getImdbScore } from '@/lib/imdb';
import { getRatings } from '@/lib/tmdb';
import { getAnime } from '@/lib/anilist';
import { getDetailAvailability } from '@/lib/detail-availability';
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const imdb = params.get('imdb'), anilist = params.get('anilist'), tmdb = params.get('tmdb'), kind = params.get('kind');
  if ([imdb, anilist, tmdb].filter(value => value !== null).length !== 1
    || (imdb !== null && !/^tt\d+$/.test(imdb))
    || [anilist, tmdb].some(value => value !== null && (!/^[1-9]\d*$/.test(value) || Number(value) > 2147483647))
    || (tmdb !== null && kind !== 'tv' && kind !== 'movie')) return Response.json({ error: 'Invalid IMDb lookup' }, { status: 400 });
  try {
    let ratings;
    if (imdb) ratings = await getImdbScore(imdb);
    else if (tmdb) ratings = await getRatings(kind as 'tv' | 'movie', Number(tmdb), 604800);
    else {
      const anime = await getAnime(Number(anilist));
      ratings = anime ? (await getDetailAvailability(anime)).ratings : { imdbStatus: 'error' as const };
    }
    return Response.json(ratings, { headers: { 'Cache-Control': ratings.imdbStatus === 'ready' ? 'public, max-age=60, s-maxage=3600' : 'no-store' } });
  } catch { return Response.json({ imdbStatus: 'error' }, { headers: { 'Cache-Control': 'no-store' } }); }
}
