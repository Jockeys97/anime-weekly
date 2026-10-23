import { getWeeklyAnimeScores } from '@/lib/weekly-anime-scores';
import { parseWeek } from '@/lib/week';
export const maxDuration = 30;
export async function GET(request: Request) {
  const week = new URL(request.url).searchParams.get('week');
  if (!week || !parseWeek(week)) return Response.json({ error: 'Invalid week' }, { status: 400 });
  try {
    const result = await getWeeklyAnimeScores(week);
    return Response.json(result, { headers: { 'Cache-Control': result.unavailable ? 'no-store' : 'public, max-age=60, s-maxage=21600, stale-while-revalidate=604800' } });
  } catch {
    return Response.json({ error: 'Anime scores unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
