import { getAnime } from '@/lib/anilist';
import { getMyAnimeListScore } from '@/lib/myanimelist';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const mal = params.get('mal'), anilist = params.get('anilist');
  const raw = mal ?? anilist;
  if (Boolean(mal) === Boolean(anilist) || !raw || !/^[1-9]\d*$/.test(raw) || Number(raw) > 2147483647) return Response.json({}, { status: 400 });
  let id = mal ? Number(mal) : null;
  if (!id) {
    const anime = await getAnime(Number(anilist));
    if (!anime) return Response.json({ malStatus: 'error' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    id = anime.idMal;
  }
  const ratings = id ? await getMyAnimeListScore(id) : { malStatus: 'unmatched' };
  const failed = ratings.malStatus === 'error';
  return Response.json(ratings, { status: failed ? 503 : 200, headers: { 'Cache-Control': failed ? 'no-store' : 'public, max-age=300, s-maxage=86400, stale-while-revalidate=604800' } });
}
