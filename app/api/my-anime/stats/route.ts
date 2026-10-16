import { cookies } from 'next/headers';
import { readToken, tokenCookie, tokenNeedsRefresh } from '@/lib/my-anime-auth';
import { myAnimeConfig } from '@/lib/my-anime-config';
import { getPersonalStats } from '@/lib/my-anime-stats';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function GET() {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!myAnimeConfig().trakt) return Response.json({}, { status: 404, headers });
  const token = readToken('trakt', (await cookies()).get(tokenCookie('trakt'))?.value);
  if (!token || tokenNeedsRefresh(token)) return Response.json({}, { status: 401, headers });
  const data = await getPersonalStats(token.accessToken);
  return Response.json(data, { status: data.status === 'unavailable' ? 503 : 200, headers });
}
