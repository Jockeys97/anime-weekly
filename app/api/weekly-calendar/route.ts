import { getWeeklyCalendarSchedule } from '@/lib/weekly-enrichment';
import { parseWeek } from '@/lib/week';
export const maxDuration = 30;
export async function GET(request: Request) {
  const week = new URL(request.url).searchParams.get('week');
  if (!week || !parseWeek(week)) return Response.json({ error: 'Invalid week' }, { status: 400 });
  try {
    const result = await getWeeklyCalendarSchedule(week);
    return Response.json(result, { headers: { 'Cache-Control': result.unavailable ? 'no-store' : 'public, max-age=60, s-maxage=300' } });
  } catch {
    return Response.json({ error: 'Weekly calendar unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
