import { isLocale } from '@/lib/locales';
import { parseWeek } from '@/lib/week';
import { getWeeklyDubbing } from '@/lib/weekly-dubbing';
export const maxDuration = 30;
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const week = params.get('week'), locale = params.get('locale');
  if (!week || !parseWeek(week) || !isLocale(locale)) return Response.json({ error: 'Invalid weekly dubbing lookup' }, { status: 400 });
  try {
    const result = await getWeeklyDubbing(week, locale);
    return Response.json(result, { headers: { 'Cache-Control': result.complete ? 'public, max-age=300, s-maxage=21600, stale-while-revalidate=604800' : 'public, max-age=60, s-maxage=21600, stale-while-revalidate=604800' } });
  } catch {
    return Response.json({ statuses: {}, complete: false }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
