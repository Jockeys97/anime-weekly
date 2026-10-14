import { getWeeklyTitleSchedule } from '@/lib/weekly-enrichment';
import { weeklyLookup } from '@/lib/weekly-api';
import { withTimeout } from '@/lib/async-timeout';
export const maxDuration = 30;
export async function GET(request: Request) {
  const lookup = weeklyLookup(request.url);
  if (!lookup) return Response.json({ error: 'Invalid weekly lookup' }, { status: 400 });
  try {
    const result = await withTimeout(getWeeklyTitleSchedule(lookup.week, lookup.kind, lookup.id), 25000);
    if (!result) return Response.json({ error: 'Title not in this week' }, { status: 404 });
    return Response.json(result, { headers: { 'Cache-Control': result.unavailable ? 'no-store' : 'public, max-age=60, s-maxage=3600' } });
  } catch {
    console.error('Weekly schedule unavailable');
    return Response.json({ events: [], episodeDates: [], unavailable: true }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
