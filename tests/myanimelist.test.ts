import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', async () => import('./helpers/next-cache'));
vi.mock('../lib/rate-limited-fetch', () => ({ jikanFetch: vi.fn() }));
vi.mock('../lib/anilist', () => ({ getAnime: vi.fn() }));
import { jikanFetch } from '../lib/rate-limited-fetch';
import { getAnime } from '../lib/anilist';
import { getMyAnimeListScore } from '../lib/myanimelist';
import { GET } from '../app/api/myanimelist/route';
beforeEach(async () => { (await import('./helpers/next-cache')).clearNextCache(); });
afterEach(() => vi.resetAllMocks());
const data = { mal_id: 123, score: 8.12, members: 1200000, scored_by: 456789 };
it('caches exact-title results daily, coalesces concurrent calls and retains real vote counts', async () => {
  vi.mocked(jikanFetch).mockResolvedValue(Response.json({ data }));
  const [first, second] = await Promise.all([getMyAnimeListScore(123), getMyAnimeListScore(123)]);
  expect(first).toEqual({ malId: 123, malStatus: 'ready', malScore: 8.12, malMembers: 1200000, malScoredBy: 456789 });
  expect(second).toEqual(first);
  expect(await getMyAnimeListScore(123)).toEqual(first);
  expect(jikanFetch).toHaveBeenCalledExactlyOnceWith('https://api.jikan.moe/v4/anime/123', { cache: 'no-store', next: undefined }, 8000);
});
it.each([429, 500])('does not cache HTTP %s as an absent score', async status => {
  vi.mocked(jikanFetch).mockResolvedValueOnce(new Response(null, { status })).mockResolvedValueOnce(Response.json({ data }));
  expect((await getMyAnimeListScore(123)).malStatus).toBe('error');
  expect((await getMyAnimeListScore(123)).malScore).toBe(8.12);
  expect(jikanFetch).toHaveBeenCalledTimes(2);
});
it.each([{ ...data, mal_id: 124 }, { ...data, score: 12 }, { ...data, score: '8.12' }, { mal_id: 123 }, {}])('rejects mismatched IDs and malformed upstream data', async value => {
  vi.mocked(jikanFetch).mockResolvedValueOnce(Response.json({ data: value }));
  expect(await getMyAnimeListScore(123)).toEqual({ malId: 123, malStatus: 'error' });
});
it('caches a confirmed unrated title without inventing a score or confusing members with votes', async () => {
  vi.mocked(jikanFetch).mockResolvedValue(Response.json({ data: { mal_id: 123, score: null, members: 100, scored_by: null } }));
  expect(await getMyAnimeListScore(123)).toEqual({ malId: 123, malStatus: 'unavailable', malScore: null, malMembers: 100 });
  await getMyAnimeListScore(123);
  expect(jikanFetch).toHaveBeenCalledTimes(1);
});
it('resolves the selected AniList season to its own MAL ID', async () => {
  vi.mocked(getAnime).mockResolvedValue({ id: 42, idMal: 123 } as Awaited<ReturnType<typeof getAnime>>);
  vi.mocked(jikanFetch).mockResolvedValue(Response.json({ data }));
  const response = await GET(new Request('https://example.test/api/myanimelist?anilist=42'));
  expect((await response.json()).malId).toBe(123);
  expect(getAnime).toHaveBeenCalledExactlyOnceWith(42);
  expect(response.headers.get('cache-control')).toContain('s-maxage=86400');
});
it.each(['', 'mal=0', 'mal=-1', 'mal=2.5', 'mal=2147483648', 'mal=1&anilist=2'])('rejects invalid lookups before upstream calls (%s)', async query => {
  expect((await GET(new Request(`https://example.test/api/myanimelist?${query}`))).status).toBe(400);
  expect(getAnime).not.toHaveBeenCalled(); expect(jikanFetch).not.toHaveBeenCalled();
});
it('returns retryable, non-cacheable errors instead of a false n/a', async () => {
  vi.mocked(jikanFetch).mockRejectedValue(new Error('offline'));
  const response = await GET(new Request('https://example.test/api/myanimelist?mal=123'));
  expect(response.status).toBe(503);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({ malId: 123, malStatus: 'error' });
});
