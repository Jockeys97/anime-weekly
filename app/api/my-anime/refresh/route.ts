import { cookies } from 'next/headers';
import { revalidateTag } from 'next/cache';
import { readToken, tokenCookie, tokenHash } from '@/lib/my-anime-auth';
import { myAnimeConfig } from '@/lib/my-anime-config';
import { personalCacheTag, personalAggregates } from '@/lib/my-anime-cache';
const lastRefresh = new Map<string, number>();
export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (request.headers.get('Origin') !== new URL(request.url).origin) return Response.json({}, { status: 403, headers });
  const config = myAnimeConfig(), store = await cookies();
  const tokens = (['trakt', 'mal'] as const).flatMap(provider => {
    const token = config[provider] ? readToken(provider, store.get(tokenCookie(provider))?.value) : null;
    return token ? [token.accessToken] : [];
  });
  if (!tokens.length) return Response.json({}, { status: 401, headers });
  const now = Date.now();
  for (const [key, time] of lastRefresh) if (now - time >= 60000) lastRefresh.delete(key);
  if (tokens.some(token => lastRefresh.has(tokenHash(token)))) return Response.json({}, { status: 429, headers: { ...headers, 'Retry-After': '60' } });
  for (const token of tokens) {
    lastRefresh.set(tokenHash(token), now);
    revalidateTag(personalCacheTag(token), { expire: 0 });
    await personalAggregates.expireTag(personalCacheTag(token));
  }
  return Response.json({ refreshed: true }, { headers });
}
