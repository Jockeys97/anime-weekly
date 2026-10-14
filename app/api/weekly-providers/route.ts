import { getWeeklyPlatformMetadata } from '@/lib/platform-metadata';
import { parseWeek } from '@/lib/week';
export const maxDuration = 30;
export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get('week');
  if (!slug || !parseWeek(slug)) return Response.json({ error: 'Invalid week' }, { status: 400 });
  try {
    const result = await getWeeklyPlatformMetadata(slug);
    return Response.json(result, { headers: { 'Cache-Control': result.unavailable ? 'no-store' : 'public, max-age=60, s-maxage=300' } });
  } catch { return Response.json({ error: 'Providers unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
