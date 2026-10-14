import { getWeeklyTitleDetails } from '@/lib/weekly-enrichment';
import { weeklyLookup } from '@/lib/weekly-api';
import { withTimeout } from '@/lib/async-timeout';
export const maxDuration = 30;
export async function GET(request: Request) {
  const lookup = weeklyLookup(request.url);
  if (!lookup) return Response.json({ error: 'Invalid weekly lookup' }, { status: 400 });
  try {
    const result = await withTimeout(getWeeklyTitleDetails(lookup.week, lookup.kind, lookup.id), 25000);
    if (!result) return Response.json({ error: 'Title not in this week' }, { status: 404 });
    const partial = result.providersUnavailable;
    return Response.json(result, { headers: { 'Cache-Control': partial ? 'no-store' : 'public, max-age=60, s-maxage=3600' } });
  } catch {
    console.error('Weekly title enrichment unavailable');
    return Response.json({ error: 'Weekly enrichment unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
