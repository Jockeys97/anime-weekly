import { getUpcomingAirings } from '@/lib/upcoming-airings';
import { calendarResponse } from '@/lib/ics';
export const revalidate = 3600;
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id) || Number(id) > 2147483647) return new Response('Invalid anime id', { status: 400 });
  try {
    const episodes = await getUpcomingAirings(Number(id));
    if (!episodes) return new Response('Anime not found', { status: 404 });
    return calendarResponse(episodes.filter(event => event.airingAt > Date.now() / 1000), `anime-${id}.ics`);
  } catch { return new Response('Airing schedule unavailable', { status: 502 }); }
}
