import { getSeasonPlatformMetadata } from '@/lib/platform-metadata';
import { parseSeason } from '@/lib/season';
export const maxDuration = 30;
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const season = parseSeason(params.get('year') ?? '', params.get('season') ?? '');
  const page = params.get('page') ?? '1';
  if (!season || !/^[1-9]\d*$/.test(page) || Number(page) > 2147483647) return Response.json({ error: 'Invalid season' }, { status: 400 });
  try {
    const result = await getSeasonPlatformMetadata(season.year, season.season, Number(page));
    return Response.json(result, { headers: { 'Cache-Control': result.unavailable ? 'no-store' : 'public, max-age=60, s-maxage=300' } });
  } catch { return Response.json({ error: 'Providers unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
