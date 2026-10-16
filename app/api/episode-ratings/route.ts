import { getImdbEpisodeChart } from '@/lib/imdb-episode-index';
import { validImdbId } from '@/lib/episode-chart';
export const preferredRegion = 'iad1';

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('imdb');
  if (!validImdbId(id)) return Response.json({ error: 'invalid IMDb series ID' }, { status: 400 });
  const result = await getImdbEpisodeChart(id);
  return Response.json(result, { headers: { 'cache-control': result.status === 'ready' ? 'public, max-age=60, s-maxage=300' : 'no-store' } });
}
