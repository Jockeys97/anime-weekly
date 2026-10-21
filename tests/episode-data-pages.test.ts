import { beforeEach, expect, it, vi } from 'vitest';
import type { AniListAnime } from '@/lib/anilist';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('@/lib/rate-limited-fetch', () => ({ anilistFetch: vi.fn() }));
import { anilistFetch } from '@/lib/rate-limited-fetch';
import { getAnimeEpisodes, getSitemapEpisodes } from '@/lib/episode-data';
const now = new Date('2026-10-21T12:00:00Z');
const at = now.getTime() / 1000;
const anime = (id: number) => ({ id, format: 'TV', nextAiringEpisode: null }) as AniListAnime;
const event = (episode: number, airingAt = at, mediaId = 1) => ({ id: episode, mediaId, episode, airingAt });
beforeEach(() => vi.clearAllMocks());
const response = (events: ReturnType<typeof event>[], more = false) => new Response(JSON.stringify({ data: { Page: { pageInfo: { hasNextPage: more }, airingSchedules: events } } }));
it('requests only the actual episode and its two neighbours in one cached lookup', async () => {
  vi.mocked(anilistFetch).mockResolvedValue(response([event(1000), event(1001)]));
  const result = await getAnimeEpisodes(anime(1), 1000);
  expect(result.map(e => e.episode)).toEqual([1000, 1001]);
  expect(anilistFetch).toHaveBeenCalledOnce();
  const body = JSON.parse(vi.mocked(anilistFetch).mock.calls[0][1]!.body as string);
  expect(body.variables.episodes).toEqual([999, 1000, 1001]);
});
it('uses nextAiringEpisode on a schedule outage, without generating any dates', async () => {
  vi.mocked(anilistFetch).mockRejectedValue(new Error('offline'));
  expect(await getAnimeEpisodes(anime(1), 3)).toEqual([]);
  const next = { episode: 3, airingAt: at };
  expect(await getAnimeEpisodes({ ...anime(1), nextAiringEpisode: next }, 3)).toEqual([{ id: 0, mediaId: 1, ...next }]);
});
it('filters the precise sitemap window and omits conflicting dates', async () => {
  vi.mocked(anilistFetch).mockResolvedValue(response([event(1, at - 86400), event(2, at + 14 * 86400), event(3, at + 14 * 86400 + 1), event(4, at), event(4, at + 1)]));
  expect((await getSitemapEpisodes([anime(1)], now)).map(e => e.episode)).toEqual([1, 2]);
});
it('bounds global sitemap pagination even when the upstream always reports another page', async () => {
  vi.mocked(anilistFetch).mockImplementation(async () => response([], true));
  expect(await getSitemapEpisodes([anime(1), anime(2)], now)).toEqual([]);
  expect(anilistFetch).toHaveBeenCalledTimes(40);
});
