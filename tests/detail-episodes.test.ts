import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('react', () => ({ cache: (fn: unknown) => fn }));
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('../lib/rate-limited-fetch', () => ({ anilistFetch: vi.fn() }));
import { anilistFetch } from '../lib/rate-limited-fetch';
import { getAnimeEpisodes } from '../lib/episode-data';
import { animeSeoRegressionExamples } from './fixtures/anime-detail-seo';
const anime = { ...animeSeoRegressionExamples[0].anime, id: 42, format: 'OVA', nextAiringEpisode: { episode: 3, airingAt: 1795651200 } };
afterEach(() => vi.resetAllMocks());
it('reads one bounded history page and merges real next airing without inferring missing episodes', async () => {
  vi.mocked(anilistFetch).mockResolvedValue(new Response(JSON.stringify({ data: { Page: { pageInfo: { hasNextPage: true }, airingSchedules: [{ id: 1, mediaId: 42, episode: 1, airingAt: 1793059200 }] } } })));
  expect((await getAnimeEpisodes(anime)).map(e => e.episode)).toEqual([1, 3]);
  expect(anilistFetch).toHaveBeenCalledTimes(1);
});
it('hides an empty schedule and retains only real next data on upstream failure', async () => {
  vi.mocked(anilistFetch).mockRejectedValue(new Error('Unavailable'));
  expect(await getAnimeEpisodes({ ...anime, nextAiringEpisode: null })).toEqual([]);
  expect((await getAnimeEpisodes(anime)).map(e => e.episode)).toEqual([3]);
});
